/**
 * BACKY CMS - EDIT USER PAGE
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Code2,
  Copy,
  Crown,
  Download,
  ExternalLink,
  History,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  MoreHorizontal,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import {
  deleteUser as deleteBackendUser,
  getAdminApiBase,
  getUser as getBackendUser,
  getUserPermissions,
  listAdminAuditLogs,
  transferUserOwnership,
  updateUserPermissions,
  updateUser as updateBackendUser,
  type AdminPermissionGroup,
  type AdminAuditLog,
  type AdminPermissionOverrideValue,
  type AdminUserPermissionMatrix,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed, isAdminPermissionDeniedError } from '@/lib/adminPermissionUi';
import {
  createAdminInviteToken,
  createAdminPasswordResetToken,
  getAdminUserMfa,
  listAdminAuthSessions,
  revokeAdminAuthSession,
  updateAdminUserMfa,
  type AdminInviteToken,
  type AdminPasswordResetToken,
  type AdminSessionSummary,
  type AdminUserMfaEnrollment,
} from '@/lib/adminAuthApi';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';
import { useStore, type User } from '@/stores/mockStore';

export const Route = createFileRoute('/users/$userId')({
  component: EditUserPage,
});

type UserRole = User['role'];
type UserStatus = User['status'];
type UserDetailPermissionKey = 'users.view' | 'users.manage' | 'users.delete' | 'activity.export';

const USER_DETAIL_PERMISSION_ROLE_DEFAULTS: Record<UserDetailPermissionKey, Array<AuthUser['role']>> = {
  'users.view': ['owner', 'admin'],
  'users.manage': ['owner', 'admin'],
  'users.delete': ['owner', 'admin'],
  'activity.export': ['owner', 'admin'],
};

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; detail: string }> = [
  { value: 'owner', label: 'Owner', detail: 'Complete workspace authority, billing, settings, users, and publishing.' },
  { value: 'admin', label: 'Admin', detail: 'Runs sites, content, media, products, forms, comments, and team access.' },
  { value: 'editor', label: 'Editor', detail: 'Builds pages, writes posts, manages media, and updates public content.' },
  { value: 'viewer', label: 'Viewer', detail: 'Reviews workspace data without making changes.' },
];

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string; detail: string }> = [
  { value: 'active', label: 'Active', detail: 'Can sign in and use the workspace.' },
  { value: 'invited', label: 'Invited', detail: 'Invitation exists, but the person has not joined yet.' },
  { value: 'inactive', label: 'Inactive', detail: 'Kept for records without active access.' },
  { value: 'suspended', label: 'Suspended', detail: 'Blocked until an admin restores access.' },
];

const INVITE_EXPIRY_OPTIONS = [
  { value: 1440, label: '24 hours' },
  { value: 10080, label: '7 days' },
  { value: 43200, label: '30 days' },
];

const RESET_EXPIRY_OPTIONS = [
  { value: 15, label: '15 minutes' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 1440, label: '24 hours' },
];

const USER_AUDIT_ACTION_OPTIONS = [
  { value: 'all', label: 'All activity' },
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Removed' },
  { value: 'user.permission_overrides.update', label: 'Permission changes' },
  { value: 'user.invite_token.create', label: 'Invite links' },
  { value: 'user.invite.accept', label: 'Invite accepted' },
  { value: 'user.password_reset_token.create', label: 'Reset tokens' },
  { value: 'user.password_reset.accept', label: 'Reset accepted' },
  { value: 'user.mfa.update', label: 'MFA changes' },
  { value: 'user.mfa.recovery_codes.rotate', label: 'MFA recovery codes' },
  { value: 'user.import.rollback', label: 'Import rollback' },
];

const ROLE_CAPABILITIES: Array<{ label: string; roles: UserRole[] }> = [
  { label: 'View dashboards, sites, content, submissions, and reports', roles: ['owner', 'admin', 'editor', 'viewer'] },
  { label: 'Create and edit pages, posts, forms, collections, and media', roles: ['owner', 'admin', 'editor'] },
  { label: 'Publish content and update products or orders', roles: ['owner', 'admin', 'editor'] },
  { label: 'Manage users, settings, integrations, and API keys', roles: ['owner', 'admin'] },
  { label: 'Own billing, destructive settings, and workspace transfer', roles: ['owner'] },
];

const STATUS_OUTCOMES: Record<UserStatus, string> = {
  active: 'This user can sign in after auth accepts their credentials.',
  invited: 'This user is saved as pending and can be activated from this page.',
  inactive: 'This user stays in records without active workspace access.',
  suspended: 'This user is blocked until an admin changes the account state.',
};

const LIFECYCLE_ACTIONS: Array<{ status: UserStatus; label: string; detail: string }> = [
  { status: 'active', label: 'Activate', detail: 'Restore normal workspace access.' },
  { status: 'invited', label: 'Set invited', detail: 'Return the user to a pending invite state.' },
  { status: 'inactive', label: 'Mark inactive', detail: 'Keep the record without active access.' },
  { status: 'suspended', label: 'Suspend', detail: 'Block access until an admin restores it.' },
];

const USER_DETAIL_CONTROL_AREAS = [
  {
    title: 'Identity',
    detail: 'Name, email, and persisted account record.',
    href: '#user-detail-identity',
  },
  {
    title: 'Role and status',
    detail: 'Access level, lifecycle state, and account outcome.',
    href: '#user-detail-access',
  },
  {
    title: 'Permissions',
    detail: 'Capability groups enabled or denied by the selected role.',
    href: '#user-detail-permissions',
  },
  {
    title: 'API update',
    detail: 'Payload sent to the user detail endpoint.',
    href: '#user-detail-api',
  },
  {
    title: 'Activity',
    detail: 'Audit events for this exact user record.',
    href: '#user-detail-activity',
  },
  {
    title: 'Recovery',
    detail: 'Password reset token, email handoff, and lifecycle actions.',
    href: '#user-detail-recovery',
  },
  {
    title: 'MFA',
    detail: 'Per-user two-factor enforcement and one-time recovery codes.',
    href: '#user-detail-mfa',
  },
  {
    title: 'Ownership',
    detail: 'Transfer workspace ownership to an active admin.',
    href: '#user-detail-ownership',
  },
  {
    title: 'Danger zone',
    detail: 'Removal guardrails and destructive access controls.',
    href: '#user-detail-danger',
  },
] as const;

const getInitials = (name: string) => (
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'
);

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const maskSecret = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'Missing token';
  if (trimmed.length <= 12) return 'Hidden';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

const userDetailActionMetadata = (statusId: string, actionStatus: string, disabledReason = '') => ({
  'aria-describedby': statusId,
  'data-action-state': disabledReason ? 'blocked' : 'ready',
  'data-action-status': actionStatus,
  'data-disabled-reason': disabledReason || undefined,
});

function EditUserPage() {
  const navigate = useNavigate();
  const { userId } = Route.useParams();
  const currentAdmin = useAuthStore((state) => state.user);
  const currentSessionToken = useAuthStore((state) => state.session?.token || '');
  const { users, setUsers } = useStore();
  const user = users.find((item) => item.id === userId);
  const userDetailUrl = useMemo(() => `${getAdminApiBase()}/users/${userId}`, [userId]);

  const [isLoadingUser, setIsLoadingUser] = useState(!user);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isUserAccessDenied, setIsUserAccessDenied] = useState(false);
  const [userAuditLogs, setUserAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoadingUserAudit, setIsLoadingUserAudit] = useState(false);
  const [userAuditError, setUserAuditError] = useState<string | null>(null);
  const [userAuditActionFilter, setUserAuditActionFilter] = useState('all');
  const [userAuditRequestIdDraft, setUserAuditRequestIdDraft] = useState('');
  const [userAuditRequestIdFilter, setUserAuditRequestIdFilter] = useState('');
  const [selectedUserAuditLogId, setSelectedUserAuditLogId] = useState<string | null>(null);
  const [currentAdminPermissionMatrix, setCurrentAdminPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isLoadingCurrentAdminPermissions, setIsLoadingCurrentAdminPermissions] = useState(Boolean(currentAdmin?.id));
  const [currentAdminPermissionError, setCurrentAdminPermissionError] = useState<string | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isLoadingPermissions, setIsLoadingPermissions] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [savingPermissionKey, setSavingPermissionKey] = useState<string | null>(null);
  const [userSessions, setUserSessions] = useState<AdminSessionSummary[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<AdminInviteToken | null>(null);
  const [inviteExpiresInMinutes, setInviteExpiresInMinutes] = useState(10080);
  const [isCreatingInviteToken, setIsCreatingInviteToken] = useState(false);
  const [inviteTokenNotice, setInviteTokenNotice] = useState<string | null>(null);
  const [passwordResetToken, setPasswordResetToken] = useState<AdminPasswordResetToken | null>(null);
  const [resetExpiresInMinutes, setResetExpiresInMinutes] = useState(60);
  const [isCreatingResetToken, setIsCreatingResetToken] = useState(false);
  const [resetTokenNotice, setResetTokenNotice] = useState<string | null>(null);
  const [userMfa, setUserMfa] = useState<AdminUserMfaEnrollment | null>(null);
  const [isLoadingUserMfa, setIsLoadingUserMfa] = useState(false);
  const [isSavingUserMfa, setIsSavingUserMfa] = useState(false);
  const [mfaNotice, setMfaNotice] = useState<string | null>(null);
  const [mfaRecoveryCodes, setMfaRecoveryCodes] = useState<string[]>([]);
  const [isTransferringOwnership, setIsTransferringOwnership] = useState(false);
  const [ownershipTransferNotice, setOwnershipTransferNotice] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState<{
    fullName: string;
    email: string;
    role: UserRole;
    status: UserStatus;
  }>({
    fullName: '',
    email: '',
    role: 'editor',
    status: 'invited',
  });
  const canUseCurrentAdminRoleDefaults = isLoadingCurrentAdminPermissions && !currentAdminPermissionMatrix && Boolean(currentAdmin);
  const isCurrentAdminPermissionMatrixPending = isLoadingCurrentAdminPermissions && !currentAdminPermissionMatrix && !canUseCurrentAdminRoleDefaults;
  const isUserDetailPermissionAllowed = (key: UserDetailPermissionKey) => (
    isAdminPermissionAllowed(currentAdminPermissionMatrix, currentAdmin, key, USER_DETAIL_PERMISSION_ROLE_DEFAULTS)
    || (canUseCurrentAdminRoleDefaults && Boolean(currentAdmin && USER_DETAIL_PERMISSION_ROLE_DEFAULTS[key].includes(currentAdmin.role)))
  );
  const canViewUsers = isUserDetailPermissionAllowed('users.view');
  const canManageUsers = isUserDetailPermissionAllowed('users.manage');
  const canDeleteUsers = isUserDetailPermissionAllowed('users.delete');
  const canExportActivity = isUserDetailPermissionAllowed('activity.export');
  const viewPermissionTitle = canViewUsers ? undefined : adminPermissionReason(currentAdminPermissionMatrix, currentAdmin, 'users.view', USER_DETAIL_PERMISSION_ROLE_DEFAULTS);
  const managePermissionTitle = canManageUsers ? undefined : adminPermissionReason(currentAdminPermissionMatrix, currentAdmin, 'users.manage', USER_DETAIL_PERMISSION_ROLE_DEFAULTS);
  const deletePermissionTitle = canDeleteUsers ? undefined : adminPermissionReason(currentAdminPermissionMatrix, currentAdmin, 'users.delete', USER_DETAIL_PERMISSION_ROLE_DEFAULTS);
  const activityPermissionTitle = canExportActivity ? undefined : adminPermissionReason(currentAdminPermissionMatrix, currentAdmin, 'activity.export', USER_DETAIL_PERMISSION_ROLE_DEFAULTS);
  const isUserDetailBusy = isLoadingUser || isLoading;
  const selectedUserAuditLog = useMemo(
    () => userAuditLogs.find((log) => log.id === selectedUserAuditLogId) || userAuditLogs[0] || null,
    [selectedUserAuditLogId, userAuditLogs],
  );

  useEffect(() => {
    setIsLoadingUser(!user);
    setIsUserAccessDenied(false);
    setNotice(null);
  }, [userId]);

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: user.status,
      });
    }
  }, [user]);

  const loadCurrentAdminUserPermissions = useCallback(() => {
    let cancelled = false;
    setCurrentAdminPermissionError(null);

    if (!currentAdmin?.id) {
      setCurrentAdminPermissionMatrix(null);
      setIsLoadingCurrentAdminPermissions(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingCurrentAdminPermissions(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setCurrentAdminPermissionMatrix(matrix);
          setCurrentAdminPermissionError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCurrentAdminPermissionMatrix(null);
          setCurrentAdminPermissionError(error instanceof Error ? error.message : 'Unable to load your user permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingCurrentAdminPermissions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  useEffect(() => loadCurrentAdminUserPermissions(), [loadCurrentAdminUserPermissions]);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      if (isCurrentAdminPermissionMatrixPending) return;
      if (!canViewUsers) {
        setNotice(viewPermissionTitle || 'Your account cannot view users.');
        setIsLoadingUser(false);
        return;
      }

      setIsLoadingUser(true);
      try {
        const backendUser = await getBackendUser(userId);
        if (!cancelled) {
          setUsers([
            backendUser,
            ...users.filter((item) => item.id !== backendUser.id),
          ]);
          setIsUserAccessDenied(false);
          setNotice(null);
        }
      } catch (error) {
        if (!cancelled) {
          const denied = isAdminPermissionDeniedError(error);
          setIsUserAccessDenied(denied);
          setNotice(denied
            ? error instanceof Error ? error.message : viewPermissionTitle || 'Your account cannot view users.'
            : 'Using local fallback user data because the backend users API is unavailable.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingUser(false);
        }
      }
    };

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [canViewUsers, isCurrentAdminPermissionMatrixPending, setUsers, userId, viewPermissionTitle]);

  const loadUserAuditLogs = useCallback(async () => {
    if (isCurrentAdminPermissionMatrixPending) return;
    if (!canExportActivity) {
      setUserAuditLogs([]);
      setUserAuditError(null);
      return;
    }

    setIsLoadingUserAudit(true);
    setUserAuditError(null);

    try {
      const result = await listAdminAuditLogs({
        entity: 'user',
        entityId: userId,
        action: userAuditActionFilter === 'all' ? undefined : userAuditActionFilter,
        requestId: userAuditRequestIdFilter || undefined,
        limit: 25,
      });
      setUserAuditLogs(result.logs);
    } catch (error) {
      setUserAuditError(error instanceof Error ? error.message : 'Unable to load user activity.');
      setUserAuditLogs([]);
    } finally {
      setIsLoadingUserAudit(false);
    }
  }, [canExportActivity, isCurrentAdminPermissionMatrixPending, userAuditActionFilter, userAuditRequestIdFilter, userId]);

  useEffect(() => {
    void loadUserAuditLogs();
  }, [loadUserAuditLogs]);

  useEffect(() => {
    setSelectedUserAuditLogId((current) => (
      current && userAuditLogs.some((log) => log.id === current)
        ? current
        : userAuditLogs[0]?.id || null
    ));
  }, [userAuditLogs]);

  const applyUserAuditFilters = () => {
    setUserAuditRequestIdFilter(userAuditRequestIdDraft.trim());
  };

  const clearUserAuditFilters = () => {
    setUserAuditActionFilter('all');
    setUserAuditRequestIdDraft('');
    setUserAuditRequestIdFilter('');
  };

  const loadPermissionMatrix = useCallback(async () => {
    if (isCurrentAdminPermissionMatrixPending) return;
    if (!canViewUsers) {
      setPermissionMatrix(null);
      setPermissionError(viewPermissionTitle || 'Your account cannot view user permissions.');
      return;
    }

    setIsLoadingPermissions(true);
    setPermissionError(null);

    try {
      const matrix = await getUserPermissions(userId);
      setPermissionMatrix(matrix);
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : 'Unable to load user permission matrix.');
      setPermissionMatrix(null);
    } finally {
      setIsLoadingPermissions(false);
    }
  }, [canViewUsers, isCurrentAdminPermissionMatrixPending, userId, viewPermissionTitle]);

  useEffect(() => {
    void loadPermissionMatrix();
  }, [loadPermissionMatrix]);

  const savePermissionOverride = useCallback(async (
    permissionKey: string,
    value: AdminPermissionOverrideValue | null,
  ) => {
    if (!canManageUsers) {
      setPermissionError(managePermissionTitle || 'Your account cannot change user permissions.');
      return;
    }

    setSavingPermissionKey(permissionKey);
    setPermissionError(null);
    setPermissionNotice(null);

    try {
      const matrix = await updateUserPermissions(userId, { [permissionKey]: value });
      setPermissionMatrix(matrix);
      setPermissionNotice(value ? `Saved ${value} override for ${permissionKey}.` : `Restored inherited access for ${permissionKey}.`);
      void loadUserAuditLogs();
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : 'Unable to update permission override.');
    } finally {
      setSavingPermissionKey(null);
    }
  }, [canManageUsers, loadUserAuditLogs, managePermissionTitle, userId]);

  const loadUserSessions = useCallback(async () => {
    if (isCurrentAdminPermissionMatrixPending) return;
    if (!user) {
      setUserSessions([]);
      return;
    }

    if (!canManageUsers) {
      setUserSessions([]);
      setSessionNotice(managePermissionTitle || 'Your account cannot review user sessions.');
      return;
    }

    setIsLoadingSessions(true);
    setSessionNotice(null);

    try {
      const sessions = await listAdminAuthSessions(currentSessionToken, { userId: user.id });
      setUserSessions(sessions);
    } catch (error) {
      setUserSessions([]);
      setSessionNotice(error instanceof Error ? error.message : 'Unable to load admin sessions.');
    } finally {
      setIsLoadingSessions(false);
    }
  }, [canManageUsers, currentSessionToken, isCurrentAdminPermissionMatrixPending, managePermissionTitle, user]);

  useEffect(() => {
    void loadUserSessions();
  }, [loadUserSessions]);

  const loadUserMfa = useCallback(async () => {
    if (isCurrentAdminPermissionMatrixPending) return;
    if (!user) {
      setUserMfa(null);
      return;
    }

    if (!canViewUsers) {
      setUserMfa(null);
      setMfaNotice(viewPermissionTitle || 'Your account cannot view user MFA settings.');
      return;
    }

    setIsLoadingUserMfa(true);
    setMfaNotice(null);

    try {
      const mfa = await getAdminUserMfa(currentSessionToken, user.id);
      setUserMfa(mfa);
    } catch (error) {
      setUserMfa(null);
      setMfaNotice(error instanceof Error ? error.message : 'Unable to load user MFA settings.');
    } finally {
      setIsLoadingUserMfa(false);
    }
  }, [canViewUsers, currentSessionToken, isCurrentAdminPermissionMatrixPending, user, viewPermissionTitle]);

  useEffect(() => {
    setMfaRecoveryCodes([]);
    void loadUserMfa();
  }, [loadUserMfa]);

  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((role) => role.value === formData.role) || ROLE_OPTIONS[2],
    [formData.role],
  );
  const selectedStatus = useMemo(
    () => STATUS_OPTIONS.find((status) => status.value === formData.status) || STATUS_OPTIONS[1],
    [formData.status],
  );
  const canSubmit = formData.fullName.trim().length > 1 && isValidEmail(formData.email);
  const pendingChanges = useMemo(() => {
    if (!user) return [];

    return [
      formData.fullName.trim() !== user.fullName ? 'name' : null,
      formData.email.trim().toLowerCase() !== user.email.toLowerCase() ? 'email' : null,
      formData.role !== user.role ? 'role' : null,
      formData.status !== user.status ? 'status' : null,
    ].filter((change): change is string => Boolean(change));
  }, [formData.email, formData.fullName, formData.role, formData.status, user]);
  const hasUnsavedChanges = pendingChanges.length > 0;
  const isCurrentUser = Boolean(user && currentAdmin && (
    user.id === currentAdmin.id ||
    user.email.trim().toLowerCase() === currentAdmin.email.trim().toLowerCase()
  ));
  const hasSelfAccessChanges = Boolean(user && isCurrentUser && (
    formData.role !== user.role ||
    formData.status !== user.status
  ));
  const canCreateResetToken = Boolean(
    canManageUsers &&
    !isUserDetailBusy &&
    !isCreatingResetToken &&
    formData.status !== 'inactive' &&
    formData.status !== 'suspended',
  );
  const canCreateInviteToken = Boolean(
    canManageUsers &&
    !isUserDetailBusy &&
    !isCreatingInviteToken &&
    formData.status === 'invited',
  );
  const canManageUserMfa = Boolean(
    canManageUsers &&
    !isUserDetailBusy &&
    !isLoadingUserMfa &&
    !isSavingUserMfa,
  );
  const canTransferOwnership = Boolean(
    canManageUsers &&
    currentAdmin?.role === 'owner' &&
    !isCurrentUser &&
    formData.status === 'active' &&
    !isUserDetailBusy &&
    !isTransferringOwnership,
  );
  const canSaveUserDetail = canManageUsers && canSubmit && hasUnsavedChanges && !hasSelfAccessChanges;
  const userDetailBusyDisabledReason = isUserDetailBusy ? 'User detail is busy while Backy loads or saves this account.' : '';
  const userDetailManageDisabledReason = !canManageUsers
    ? managePermissionTitle || 'Your account cannot manage users.'
    : '';
  const userDetailDeletePermissionDisabledReason = !canDeleteUsers
    ? deletePermissionTitle || 'Your account cannot remove users.'
    : '';
  const userDetailCommandActionStatusId = 'user-detail-command-action-status';
  const userDetailCommandSecondaryActionStatusId = 'user-detail-command-secondary-action-status';
  const userDetailApiActionStatusId = 'user-detail-api-action-status';
  const userDetailActivityActionStatusId = 'user-detail-activity-action-status';
  const userDetailSessionsActionStatusId = 'user-detail-sessions-action-status';
  const userDetailRecoveryActionStatusId = 'user-detail-recovery-action-status';
  const userDetailMfaActionStatusId = 'user-detail-mfa-action-status';
  const userDetailOwnershipActionStatusId = 'user-detail-ownership-action-status';
  const userDetailDangerActionStatusId = 'user-detail-danger-action-status';
  const userDetailHandoffActionDisabledReason = userDetailBusyDisabledReason;
  const userDetailSaveActionDisabledReason = userDetailBusyDisabledReason ||
    userDetailManageDisabledReason ||
    (!canSubmit ? 'Enter a full name and a valid email address before saving.' : '') ||
    (hasSelfAccessChanges ? 'Use another owner/admin account to change your own role or account status.' : '') ||
    (!hasUnsavedChanges ? 'No account changes to save.' : '');
  const userDetailResetActionDisabledReason = userDetailManageDisabledReason ||
    userDetailBusyDisabledReason ||
    (!hasUnsavedChanges ? 'No unsaved account edits to reset.' : '');
  const userDetailCommandSecondaryActionState = userDetailHandoffActionDisabledReason ? 'busy' : 'ready';
  const userDetailCopyHandoffActionStatus = userDetailHandoffActionDisabledReason
    ? `Copy manifest unavailable: ${userDetailHandoffActionDisabledReason}`
    : 'Copy manifest available.';
  const userDetailDownloadHandoffActionStatus = userDetailHandoffActionDisabledReason
    ? `Download JSON unavailable: ${userDetailHandoffActionDisabledReason}`
    : 'Download JSON available.';
  const userDetailCommandSecondaryActionStatus = [
    userDetailCopyHandoffActionStatus,
    userDetailDownloadHandoffActionStatus,
  ].join(' ');
  const userDetailCommandActionStatus = [
    userDetailBusyDisabledReason ? `Back to users unavailable: ${userDetailBusyDisabledReason}` : 'Back to users available.',
    userDetailCopyHandoffActionStatus,
    userDetailDownloadHandoffActionStatus,
    userDetailSaveActionDisabledReason ? `Save changes unavailable: ${userDetailSaveActionDisabledReason}` : 'Save changes available.',
    userDetailResetActionDisabledReason ? `Reset changes unavailable: ${userDetailResetActionDisabledReason}` : 'Reset changes available.',
  ].join(' ');
  const userDetailCommandActionState = isUserDetailBusy ? 'blocked' : 'ready';
  const userDetailApiActionStatus = [
    userDetailHandoffActionDisabledReason ? `Copy API URL unavailable: ${userDetailHandoffActionDisabledReason}` : 'Copy API URL available.',
    userDetailHandoffActionDisabledReason ? `Copy API manifest unavailable: ${userDetailHandoffActionDisabledReason}` : 'Copy API manifest available.',
  ].join(' ');
  const userDetailActivityDisabledReason = !canExportActivity
    ? activityPermissionTitle || 'Your account cannot export user activity.'
    : isLoadingUserAudit
      ? 'User activity is loading.'
      : '';
  const userDetailActivityClearDisabledReason = userDetailActivityDisabledReason ||
    (userAuditActionFilter === 'all' && !userAuditRequestIdDraft && !userAuditRequestIdFilter
      ? 'No activity filters are active.'
      : '');
  const userDetailActivityActionStatus = [
    userDetailActivityDisabledReason ? `Activity refresh unavailable: ${userDetailActivityDisabledReason}` : 'Activity refresh available.',
    userDetailActivityDisabledReason ? `Activity action filter unavailable: ${userDetailActivityDisabledReason}` : 'Activity action filter available.',
    userDetailActivityDisabledReason ? `Activity request filter unavailable: ${userDetailActivityDisabledReason}` : 'Activity request filter available.',
    userDetailActivityDisabledReason ? `Apply activity filters unavailable: ${userDetailActivityDisabledReason}` : 'Apply activity filters available.',
    userDetailActivityClearDisabledReason ? `Clear activity filters unavailable: ${userDetailActivityClearDisabledReason}` : 'Clear activity filters available.',
  ].join(' ');
  const userDetailActivityActionState = userDetailActivityDisabledReason ? 'blocked' : 'ready';
  const userDetailSessionsRefreshDisabledReason = userDetailManageDisabledReason ||
    (isLoadingSessions ? 'Admin sessions are loading.' : '');
  const userDetailSessionsActionStatus = [
    userDetailSessionsRefreshDisabledReason ? `Session refresh unavailable: ${userDetailSessionsRefreshDisabledReason}` : 'Session refresh available.',
    userSessions.length === 0
      ? 'No revocable admin sessions are loaded.'
      : `${userSessions.filter((session) => !session.current).length} revocable admin session${userSessions.filter((session) => !session.current).length === 1 ? '' : 's'} loaded.`,
    'Current sessions are protected from revocation.',
  ].join(' ');
  const userDetailSessionsActionState = userDetailSessionsRefreshDisabledReason ? 'blocked' : 'ready';
  const inviteTokenStatusDisabledReason = formData.status !== 'invited'
    ? 'Set this account to invited before issuing a new invite link.'
    : '';
  const resetTokenStatusDisabledReason = formData.status === 'inactive' || formData.status === 'suspended'
    ? 'Activate or invite this account before issuing a new reset token.'
    : '';
  const inviteTokenActionDisabledReason = userDetailManageDisabledReason ||
    userDetailBusyDisabledReason ||
    (isCreatingInviteToken ? 'Invite link generation is already running.' : '') ||
    inviteTokenStatusDisabledReason;
  const resetTokenActionDisabledReason = userDetailManageDisabledReason ||
    userDetailBusyDisabledReason ||
    (isCreatingResetToken ? 'Password reset token generation is already running.' : '') ||
    resetTokenStatusDisabledReason;
  const recoveryDeliveryActionDisabledReason = userDetailManageDisabledReason || userDetailBusyDisabledReason;
  const inviteExpiryDisabledReason = userDetailManageDisabledReason ||
    userDetailBusyDisabledReason ||
    (isCreatingInviteToken ? 'Invite link generation is already running.' : '');
  const resetExpiryDisabledReason = userDetailManageDisabledReason ||
    userDetailBusyDisabledReason ||
    (isCreatingResetToken ? 'Password reset token generation is already running.' : '');
  const getLifecycleActionDisabledReason = (status: UserStatus) => {
    if (isUserDetailBusy) return userDetailBusyDisabledReason;
    if (status === formData.status) return 'This lifecycle state is already active.';
    if (isCurrentUser) return 'Use another owner/admin account to change your own account status.';
    return userDetailManageDisabledReason;
  };
  const userDetailRecoveryActionStatus = [
    inviteTokenActionDisabledReason ? `Invite link unavailable: ${inviteTokenActionDisabledReason}` : 'Invite link available.',
    resetTokenActionDisabledReason ? `Reset token unavailable: ${resetTokenActionDisabledReason}` : 'Reset token available.',
    recoveryDeliveryActionDisabledReason ? `Email reset unavailable: ${recoveryDeliveryActionDisabledReason}` : 'Email reset available.',
    ...LIFECYCLE_ACTIONS.map((action) => {
      const disabledReason = getLifecycleActionDisabledReason(action.status);
      return disabledReason ? `${action.label} unavailable: ${disabledReason}` : `${action.label} available.`;
    }),
  ].join(' ');
  const userDetailRecoveryActionState = recoveryDeliveryActionDisabledReason || (inviteTokenActionDisabledReason && resetTokenActionDisabledReason)
    ? 'blocked'
    : 'ready';
  const mfaRefreshActionDisabledReason = !canViewUsers
    ? viewPermissionTitle || 'Your account cannot view user MFA settings.'
    : isLoadingUserMfa
      ? 'MFA settings are already loading.'
      : '';
  const mfaManageActionDisabledReason = userDetailManageDisabledReason ||
    userDetailBusyDisabledReason ||
    (isLoadingUserMfa ? 'MFA settings are still loading.' : '') ||
    (isSavingUserMfa ? 'MFA settings are already being saved.' : '');
  const mfaRecoveryCopyDisabledReason = userDetailManageDisabledReason ||
    userDetailBusyDisabledReason ||
    (mfaRecoveryCodes.length === 0 ? 'Generate new recovery codes before copying them.' : '');
  const userDetailMfaActionStatus = [
    mfaRefreshActionDisabledReason ? `MFA refresh unavailable: ${mfaRefreshActionDisabledReason}` : 'MFA refresh available.',
    mfaManageActionDisabledReason ? `MFA updates unavailable: ${mfaManageActionDisabledReason}` : 'MFA updates available.',
    mfaRecoveryCopyDisabledReason ? `Recovery code copy unavailable: ${mfaRecoveryCopyDisabledReason}` : 'Recovery code copy available.',
  ].join(' ');
  const userDetailMfaActionState = mfaManageActionDisabledReason ? 'blocked' : 'ready';
  const ownershipTransferDisabledReason = userDetailManageDisabledReason ||
    (currentAdmin?.role !== 'owner' ? 'Only the signed-in workspace owner can transfer ownership.' : '') ||
    (isCurrentUser ? 'Ownership transfer needs a separate active target account.' : '') ||
    (formData.status !== 'active' ? 'Activate the target user before transferring workspace ownership.' : '') ||
    userDetailBusyDisabledReason ||
    (isTransferringOwnership ? 'Ownership transfer is already running.' : '');
  const userDetailOwnershipActionStatus = ownershipTransferDisabledReason
    ? `Ownership transfer unavailable: ${ownershipTransferDisabledReason}`
    : 'Ownership transfer available.';
  const userDetailDangerActionDisabledReason = isCurrentUser
    ? 'Use another owner/admin account to remove your own access.'
    : userDetailDeletePermissionDisabledReason || userDetailBusyDisabledReason;
  const userDetailDangerActionStatus = userDetailDangerActionDisabledReason
    ? `Remove user unavailable: ${userDetailDangerActionDisabledReason}`
    : 'Remove user available.';
  const accessReadiness = useMemo(() => {
    const enabledCapabilities = ROLE_CAPABILITIES.filter((capability) => capability.roles.includes(formData.role));
    const isPrivileged = formData.role === 'owner' || formData.role === 'admin';
    const isBlocked = formData.status === 'inactive' || formData.status === 'suspended';
    const checks = [
      {
        label: 'Account record',
        detail: user ? `${user.fullName} is loaded from ${notice ? 'local fallback' : 'the users API or store'}.` : 'Load a user before editing access.',
        ready: Boolean(user),
      },
      {
        label: 'Identity',
        detail: canSubmit ? 'Name and email are saveable.' : 'Name and valid email are required.',
        ready: canSubmit,
      },
      {
        label: 'Role scope',
        detail: `${enabledCapabilities.length} capability group${enabledCapabilities.length === 1 ? '' : 's'} enabled for ${selectedRole.label}.`,
        ready: enabledCapabilities.length > 0,
      },
      {
        label: 'Lifecycle',
        detail: STATUS_OUTCOMES[formData.status],
        ready: !isBlocked,
      },
      {
        label: 'Admin guardrail',
        detail: isPrivileged ? 'This account can control settings, integrations, and users.' : 'This account cannot manage workspace settings or users.',
        ready: true,
      },
      {
        label: 'MFA recovery',
        detail: userMfa?.enabled
          ? `${userMfa.recoveryCodesRemaining} recovery code${userMfa.recoveryCodesRemaining === 1 ? '' : 's'} available for two-factor fallback.`
          : 'Per-user two-factor enforcement is optional for this account.',
        ready: !userMfa?.enabled || userMfa.recoveryCodesRemaining > 0,
      },
      {
        label: 'Ownership transfer',
        detail: canTransferOwnership
          ? 'The signed-in owner can transfer workspace ownership to this active account.'
          : isCurrentUser
            ? 'Ownership transfer needs a separate active target account.'
            : formData.status === 'active'
              ? 'Only the signed-in workspace owner can run the explicit transfer action.'
              : 'Activate the target user before transferring workspace ownership.',
        ready: formData.status === 'active',
      },
      {
        label: 'Delete protection',
        detail: 'Backend prevents removing the last active owner or admin.',
        ready: true,
      },
      {
        label: 'Self-protection',
        detail: isCurrentUser
          ? 'This is your signed-in account, so role, status, lifecycle, and removal controls are locked here.'
          : 'A separate admin can manage this account from this page.',
        ready: true,
      },
      {
        label: 'Pending changes',
        detail: hasUnsavedChanges
          ? `${pendingChanges.length} field${pendingChanges.length === 1 ? '' : 's'} ready to save: ${pendingChanges.join(', ')}.`
          : 'No unsaved edits in this account form.',
        ready: true,
      },
    ];
    const readyCount = checks.filter((check) => check.ready).length;

    return {
      score: Math.round((readyCount / checks.length) * 100),
      checks,
      workflow: [
        { label: 'Review', detail: 'Confirm the person, status, last activity, and current permission scope.' },
        { label: 'Adjust', detail: 'Change role or lifecycle state without losing content ownership history.' },
        { label: 'Save', detail: 'Persist the user record through the backend detail endpoint.' },
        { label: 'Recover', detail: 'Use reset help, suspension, or removal when access needs intervention.' },
      ],
    };
  }, [canSubmit, canTransferOwnership, currentAdmin?.role, formData.role, formData.status, hasUnsavedChanges, isCurrentUser, notice, pendingChanges, selectedRole.label, user, userMfa]);

  if (!isCurrentAdminPermissionMatrixPending && (!canViewUsers || isUserAccessDenied)) {
    return (
      <PageShell title="User unavailable" description={notice || viewPermissionTitle || 'Your account cannot view users.'}>
        <button
          type="button"
          onClick={() => navigate({ to: '/users' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </button>
        <div
          role="alert"
          data-testid="user-detail-permission-state"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">User detail permissions need attention</p>
                <p className="mt-1 leading-6">
                  {notice || currentAdminPermissionError || viewPermissionTitle || 'Ask an owner or admin with users.view access to open this page.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={loadCurrentAdminUserPermissions}
                disabled={isLoadingCurrentAdminPermissions}
                aria-label="Retry loading user detail permissions"
                className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={cn('size-3.5', isLoadingCurrentAdminPermissions && 'animate-spin')} />
                Retry permissions
              </button>
              <Link
                to="/users"
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
              >
                Review users
              </Link>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (!user && (isLoadingUser || isCurrentAdminPermissionMatrixPending)) {
    return (
      <PageShell title="Loading user" description="Checking backend user details before opening this account.">
        <button
          type="button"
          onClick={() => navigate({ to: '/users' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </button>
        <div className="mt-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Loading user record and permission state...
        </div>
      </PageShell>
    );
  }

  if (!user) {
    return (
      <PageShell title="User not found" description="The user you requested does not exist.">
        <button
          type="button"
          onClick={() => navigate({ to: '/users' })}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </button>
      </PageShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUserDetailBusy) return;
    if (!canManageUsers) {
      setNotice(managePermissionTitle || 'Your account cannot change users.');
      return;
    }

    if (!canSubmit) {
      setNotice('Enter a full name and a valid email address before saving.');
      return;
    }

    if (hasSelfAccessChanges) {
      setNotice('Use another owner/admin account to change your own role or account status.');
      return;
    }

    if (!hasUnsavedChanges) {
      setNotice('No account changes to save.');
      return;
    }

    setIsLoading(true);
    setNotice(null);

    try {
      const saved = await updateBackendUser(userId, {
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        status: formData.status,
      });
      setUsers(users.map((item) => (item.id === userId ? saved : item)));
      navigate({ to: '/users', search: { notice: `${saved.fullName} was saved.` } });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend save failed. Changes were not persisted.');
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (isUserDetailBusy) return;
    if (!canDeleteUsers) {
      setNotice(deletePermissionTitle || 'Your account cannot remove users.');
      setShowDeleteConfirm(false);
      return;
    }

    if (isCurrentUser) {
      setNotice('Use another owner/admin account to remove your own access.');
      setShowDeleteConfirm(false);
      return;
    }

    setIsLoading(true);
    setNotice(null);

    try {
      await deleteBackendUser(userId);
      setUsers(users.filter((item) => item.id !== userId));
      navigate({ to: '/users', search: { notice: `${user.fullName} was removed.` } });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend delete failed. The user was not removed.');
      setIsLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  useEffect(() => {
    if (!showDeleteConfirm) return;

    const handleDeleteDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isUserDetailBusy) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setShowDeleteConfirm(false);
    };

    document.addEventListener('keydown', handleDeleteDialogKeyDown, true);
    return () => document.removeEventListener('keydown', handleDeleteDialogKeyDown, true);
  }, [isUserDetailBusy, showDeleteConfirm]);

  const handleLifecycleAction = async (status: UserStatus) => {
    if (isUserDetailBusy || status === formData.status) return;
    if (!canManageUsers) {
      setNotice(managePermissionTitle || 'Your account cannot change users.');
      return;
    }

    if (isCurrentUser) {
      setNotice('Use another owner/admin account to change your own account status.');
      return;
    }

    setIsLoading(true);
    setNotice(null);

    try {
      const saved = await updateBackendUser(userId, { status });
      setUsers(users.map((item) => (item.id === userId ? saved : item)));
      setFormData((current) => ({ ...current, status: saved.status }));
      setNotice(`${saved.fullName} is now ${saved.status}.`);
      await loadUserAuditLogs();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Backend status update failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOwnershipTransfer = async () => {
    if (!canManageUsers) {
      setOwnershipTransferNotice(managePermissionTitle || 'Your account cannot transfer ownership.');
      return;
    }

    if (!canTransferOwnership) {
      setOwnershipTransferNotice('Ownership transfer requires a signed-in owner and a separate active target user.');
      return;
    }

    setIsTransferringOwnership(true);
    setOwnershipTransferNotice(null);
    setNotice(null);

    try {
      const result = await transferUserOwnership(userId);
      setUsers(result.users);
      setFormData((current) => ({
        ...current,
        role: result.newOwner.role,
        status: result.newOwner.status,
      }));
      setOwnershipTransferNotice(`${result.newOwner.fullName} is now workspace owner. ${result.previousOwner.fullName} was moved to admin.`);
      await loadUserAuditLogs();
    } catch (error) {
      setOwnershipTransferNotice(error instanceof Error ? error.message : 'Unable to transfer workspace ownership.');
    } finally {
      setIsTransferringOwnership(false);
    }
  };

  const resetForm = () => {
    if (isUserDetailBusy) return;
    if (!canManageUsers) {
      setNotice(managePermissionTitle || 'Your account cannot change users.');
      return;
    }

    setFormData({
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
    });
    setNotice('Unsaved account edits were reset.');
  };

  const resetMailTo = `mailto:${encodeURIComponent(user.email)}?subject=${encodeURIComponent('Reset your Backy access')}&body=${encodeURIComponent(`Hi ${user.fullName},\n\nPlease reset your Backy access before continuing work in the admin workspace.`)}`;
  const updatePayload = {
    fullName: formData.fullName.trim() || user.fullName,
    email: formData.email.trim().toLowerCase() || user.email,
    role: formData.role,
    status: formData.status,
  };
  const userDetailHandoff = {
    generatedAt: new Date().toISOString(),
    endpoint: {
      read: { method: 'GET', url: userDetailUrl },
      update: { method: 'PATCH', url: userDetailUrl },
      remove: { method: 'DELETE', url: userDetailUrl },
    },
    readiness: {
      score: accessReadiness.score,
      checks: accessReadiness.checks,
    },
    account: {
      id: user.id,
      role: user.role,
      status: user.status,
      lastActive: user.lastActive,
      hasName: Boolean(user.fullName),
      hasEmail: Boolean(user.email),
    },
    selectedState: {
      role: selectedRole,
      status: selectedStatus,
      enabledCapabilities: ROLE_CAPABILITIES
        .filter((capability) => capability.roles.includes(formData.role))
        .map((capability) => capability.label),
      pendingChanges,
      hasUnsavedChanges,
    },
    permissions: permissionMatrix
      ? {
          endpoint: `${userDetailUrl}/permissions`,
          canSignIn: permissionMatrix.canSignIn,
          allowed: permissionMatrix.summary.allowed,
          total: permissionMatrix.summary.total,
          groups: permissionMatrix.groups.map((group) => ({
            key: group.key,
            label: group.label,
            allowed: group.permissions.filter((permission) => permission.allowed).length,
            total: group.permissions.length,
          })),
        }
      : {
          endpoint: `${userDetailUrl}/permissions`,
          status: 'not-loaded',
        },
    recovery: {
      resetMailTo,
      inviteTokenEndpoint: `${userDetailUrl}/invite-link`,
      inviteExpiresInMinutes,
      latestInviteToken: inviteToken
        ? {
            id: inviteToken.id,
            expiresAt: inviteToken.expiresAt,
            deliveryConfigured: inviteToken.deliveryConfigured,
            inviteUrlAvailable: Boolean(inviteToken.inviteUrl),
            rawInviteUrlIncluded: false,
            note: 'Raw invite URLs are intentionally excluded from copy/download manifests. Use the permission-gated copy action in Account recovery.',
          }
        : null,
      resetTokenEndpoint: `${userDetailUrl}/password-reset`,
      resetExpiresInMinutes,
      latestResetToken: passwordResetToken
        ? {
            id: passwordResetToken.id,
            expiresAt: passwordResetToken.expiresAt,
            deliveryConfigured: passwordResetToken.deliveryConfigured,
            resetUrlAvailable: Boolean(passwordResetToken.resetUrl),
            rawResetUrlIncluded: false,
            note: 'Raw reset URLs are intentionally excluded from copy/download manifests. Use the permission-gated copy action in Account recovery.',
          }
        : null,
      lifecycleActions: LIFECYCLE_ACTIONS.map((action) => ({
        status: action.status,
        label: action.label,
        detail: action.detail,
        active: action.status === formData.status,
      })),
    },
    mfa: {
      endpoint: `${userDetailUrl}/mfa`,
      enabled: userMfa?.enabled || false,
      method: userMfa?.method || 'recovery-code',
      recoveryCodesRemaining: userMfa?.recoveryCodesRemaining || 0,
      recoveryCodesIssuedAt: userMfa?.recoveryCodesIssuedAt || null,
      rawRecoveryCodesIncluded: false,
      oneTimeRecoveryCodesVisible: mfaRecoveryCodes.length > 0,
      note: 'Raw MFA recovery codes are intentionally excluded from copy/download manifests. Use the permission-gated copy action while they are visible.',
    },
    ownershipTransfer: {
      endpoint: `${userDetailUrl}/transfer-ownership`,
      method: 'POST',
      targetUserId: user.id,
      targetStatus: formData.status,
      currentAdminId: currentAdmin?.id || null,
      currentAdminRole: currentAdmin?.role || null,
      available: canTransferOwnership,
      result: 'Target becomes owner; signed-in owner becomes admin.',
    },
    updatePayload,
    guardrails: [
      'Backend prevents deleting or demoting the final active owner/admin.',
      'Duplicate emails are rejected before persistence.',
      'Lifecycle quick actions persist only status; use Save changes for identity or role edits.',
      'Ownership transfer requires a signed-in owner session, a separate active target user, and records user.ownership.transfer audit metadata.',
      'Per-user activity is queryable through the admin audit log by entity and id.',
      'Suspend or inactivate access before destructive removal when ownership history matters.',
    ],
  };
  const userDetailHandoffText = JSON.stringify(userDetailHandoff, null, 2);

  const copyUserDetailText = async (value: string, label: string) => {
    if (isUserDetailBusy) return;

    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(value);
    }
  };

  const downloadUserDetailHandoff = () => {
    if (isUserDetailBusy) return;

    const blob = new Blob([userDetailHandoffText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `backy-user-${user.id}-handoff.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice('User detail handoff manifest downloaded.');
  };

  const revokeSession = async (session: AdminSessionSummary) => {
    if (session.current || revokingSessionId) return;
    if (!canManageUsers) {
      setSessionNotice(managePermissionTitle || 'Your account cannot revoke user sessions.');
      return;
    }

    setRevokingSessionId(session.id);
    setSessionNotice(null);

    try {
      const result = await revokeAdminAuthSession(currentSessionToken, session.id);
      setSessionNotice(result.revoked ? 'Admin session revoked.' : 'That session was already inactive.');
      await loadUserSessions();
    } catch (error) {
      setSessionNotice(error instanceof Error ? error.message : 'Unable to revoke admin session.');
    } finally {
      setRevokingSessionId(null);
    }
  };

  const createInviteToken = async () => {
    if (!canManageUsers) {
      setInviteTokenNotice(managePermissionTitle || 'Your account cannot generate invite links.');
      return;
    }

    if (isCreatingInviteToken) {
      return;
    }

    setIsCreatingInviteToken(true);
    setInviteTokenNotice(null);

    try {
      const invite = await createAdminInviteToken(currentSessionToken, user.id, {
        expiresInMinutes: inviteExpiresInMinutes,
      });
      setInviteToken(invite);
      setInviteTokenNotice(invite.deliveryConfigured
        ? 'Invite delivery was queued.'
        : 'Local invite link generated. Copy the invite URL for manual delivery.');
      await loadUserAuditLogs();
    } catch (error) {
      setInviteToken(null);
      setInviteTokenNotice(error instanceof Error ? error.message : 'Unable to generate invite link.');
    } finally {
      setIsCreatingInviteToken(false);
    }
  };

  const createResetToken = async () => {
    if (!canManageUsers) {
      setResetTokenNotice(managePermissionTitle || 'Your account cannot generate reset tokens.');
      return;
    }

    if (isCreatingResetToken) {
      return;
    }

    setIsCreatingResetToken(true);
    setResetTokenNotice(null);

    try {
      const reset = await createAdminPasswordResetToken(currentSessionToken, user.id, {
        expiresInMinutes: resetExpiresInMinutes,
      });
      setPasswordResetToken(reset);
      setResetTokenNotice(reset.deliveryConfigured
        ? 'Password reset delivery was queued.'
        : 'Local reset token generated. Copy the reset URL for manual delivery.');
      await loadUserAuditLogs();
    } catch (error) {
      setPasswordResetToken(null);
      setResetTokenNotice(error instanceof Error ? error.message : 'Unable to generate password reset token.');
    } finally {
      setIsCreatingResetToken(false);
    }
  };

  const saveUserMfa = async (input: { enabled?: boolean; generateRecoveryCodes?: boolean }) => {
    if (!canManageUsers) {
      setMfaNotice(managePermissionTitle || 'Your account cannot change user MFA settings.');
      return;
    }

    if (isSavingUserMfa) {
      return;
    }

    setIsSavingUserMfa(true);
    setMfaNotice(null);
    if (!input.generateRecoveryCodes) {
      setMfaRecoveryCodes([]);
    }

    try {
      const result = await updateAdminUserMfa(currentSessionToken, user.id, input);
      setUserMfa(result.mfa);
      setMfaRecoveryCodes(result.recoveryCodes);
      setMfaNotice(result.recoveryCodes.length > 0
        ? 'New recovery codes generated. Store them now because they are shown once.'
        : result.mfa.enabled
          ? 'Per-user MFA enabled.'
          : 'Per-user MFA disabled.');
      await loadUserAuditLogs();
    } catch (error) {
      setMfaNotice(error instanceof Error ? error.message : 'Unable to update user MFA settings.');
    } finally {
      setIsSavingUserMfa(false);
    }
  };

  return (
    <PageShell
      title="Edit user"
      description={`Manage access for ${user.fullName}.`}
      action={
        <button
          type="button"
          onClick={() => {
            if (!isUserDetailBusy) {
              navigate({ to: '/users' });
            }
          }}
          disabled={isUserDetailBusy}
          title={userDetailBusyDisabledReason || undefined}
          {...userDetailActionMetadata(userDetailCommandActionStatusId, userDetailCommandActionStatus, userDetailBusyDisabledReason)}
          data-testid="user-detail-back-to-users"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowLeft className="h-4 w-4" />
          Users
        </button>
      }
      className="w-full"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
          role="group"
          aria-label="User detail command actions"
          aria-describedby={userDetailCommandActionStatusId}
          data-testid="user-detail-command-center"
          data-action-state={userDetailCommandActionState}
          data-action-status={userDetailCommandActionStatus}
        >
          <span id={userDetailCommandActionStatusId} className="sr-only" data-testid="user-detail-command-action-status" aria-live="polite">
            {userDetailCommandActionStatus}
          </span>
          <span id={userDetailCommandSecondaryActionStatusId} className="sr-only" data-testid="user-detail-command-secondary-action-status" aria-live="polite">
            {userDetailCommandSecondaryActionStatus}
          </span>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">User access command center</h2>
                <span className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-semibold',
                  accessReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                )}
                >
                  {accessReadiness.score}% ready
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Control this collaborator as a full access object: identity, permissions, lifecycle, recovery, API payload, and destructive guardrails.
              </p>
            </div>
            <div className="flex flex-col gap-2 xl:items-end">
              <div className="flex flex-wrap items-center gap-2 xl:justify-end" data-testid="user-detail-primary-actions">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isUserDetailBusy || !canSaveUserDetail}
                  title={userDetailSaveActionDisabledReason || undefined}
                  {...userDetailActionMetadata(userDetailCommandActionStatusId, userDetailCommandActionStatus, userDetailSaveActionDisabledReason)}
                  iconStart={<Save className="size-4" />}
                  data-testid="user-detail-command-save"
                >
                  {isLoading ? 'Saving...' : isLoadingUser ? 'Loading user...' : 'Save changes'}
                </Button>
                {hasUnsavedChanges && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    disabled={isUserDetailBusy || !canManageUsers}
                    title={userDetailResetActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailCommandActionStatusId, userDetailCommandActionStatus, userDetailResetActionDisabledReason)}
                    data-testid="user-detail-command-reset"
                  >
                    Reset changes
                  </Button>
                )}
              </div>
              <details
                className="group relative self-start xl:self-end"
                aria-describedby={userDetailCommandSecondaryActionStatusId}
                data-action-state={userDetailCommandSecondaryActionState}
                data-action-status={userDetailCommandSecondaryActionStatus}
                data-target-user-id={user.id}
                data-testid="user-detail-secondary-actions"
                data-default-collapsed="true"
              >
                <summary
                  className="inline-flex min-h-9 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-ring group-open:bg-accent [&::-webkit-details-marker]:hidden"
                  aria-describedby={userDetailCommandSecondaryActionStatusId}
                  data-testid="user-detail-more-actions"
                >
                  <MoreHorizontal className="size-4" />
                  More actions
                </summary>
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border bg-popover p-2 shadow-lg sm:absolute sm:right-0 sm:z-20 sm:w-72" data-testid="user-detail-secondary-action-menu">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void copyUserDetailText(userDetailHandoffText, 'User detail handoff manifest')}
                    disabled={isUserDetailBusy}
                    title={userDetailHandoffActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailCommandSecondaryActionStatusId, userDetailCopyHandoffActionStatus, userDetailHandoffActionDisabledReason)}
                    className="w-full justify-start"
                    iconStart={<Copy className="size-4" />}
                    data-testid="user-detail-command-copy-manifest"
                  >
                    Copy manifest
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={downloadUserDetailHandoff}
                    disabled={isUserDetailBusy}
                    title={userDetailHandoffActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailCommandSecondaryActionStatusId, userDetailDownloadHandoffActionStatus, userDetailHandoffActionDisabledReason)}
                    className="w-full justify-start"
                    iconStart={<Download className="size-4" />}
                    data-testid="user-detail-command-download-json"
                  >
                    Download JSON
                  </Button>
                </div>
              </details>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Access readiness</h3>
              <p className="mt-1 text-sm text-muted-foreground">Checks whether this account can be safely edited, saved, suspended, or removed.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full', accessReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                  style={{ width: `${accessReadiness.score}%` }}
                />
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {accessReadiness.checks.map((check) => (
                  <AccessReadinessCheck key={check.label} {...check} />
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Access workflow</h3>
              </div>
              <div className="mt-3 grid gap-2">
                {accessReadiness.workflow.map((step, index) => (
                  <AccessWorkflowStep key={step.label} index={index + 1} {...step} />
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">User control map</h3>
            <p className="mt-1 text-sm text-muted-foreground">Jump to identity, lifecycle, permissions, API payload, and removal controls.</p>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
              {USER_DETAIL_CONTROL_AREAS.map((area) => (
                <a
                  key={area.title}
                  href={area.href}
                  className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="text-sm font-semibold text-foreground">{area.title}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                </a>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5">
          <div id="user-detail-identity" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-900 text-base font-semibold text-white">
                  {getInitials(user.fullName)}
                </span>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{user.fullName}</h2>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <StatusBadge status={user.status} />
            </div>

            {notice && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {notice}
              </div>
            )}
            {currentAdminPermissionError && (
              <div
                role="alert"
                data-testid="user-detail-rbac-permission-state"
                className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-semibold">User detail permissions need attention</p>
                      <p className="mt-1 leading-6">{currentAdminPermissionError}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={loadCurrentAdminUserPermissions}
                      disabled={isLoadingCurrentAdminPermissions}
                      aria-label="Retry loading user detail permissions"
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={cn('size-3.5', isLoadingCurrentAdminPermissions && 'animate-spin')} />
                      Retry permissions
                    </button>
                    <Link
                      to="/users"
                      className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
                    >
                      Review users
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Full name</span>
                <div className="relative mt-2">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={formData.fullName}
                    disabled={isUserDetailBusy || !canManageUsers}
                    title={!canManageUsers ? managePermissionTitle : undefined}
                    onChange={(e) => {
                      if (isUserDetailBusy) return;
                      setFormData({ ...formData, fullName: e.target.value });
                    }}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Email address</span>
                <div className="relative mt-2">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={formData.email}
                    disabled={isUserDetailBusy || !canManageUsers}
                    title={!canManageUsers ? managePermissionTitle : undefined}
                    onChange={(e) => {
                      if (isUserDetailBusy) return;
                      setFormData({ ...formData, email: e.target.value });
                    }}
                    className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                    required
                  />
                </div>
              </label>
            </div>
          </div>

          <div id="user-detail-access" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-teal-50 p-2 text-teal-700">
                <Shield className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-foreground">Role and account state</h2>
                <p className="mt-1 text-sm text-muted-foreground">These controls are persisted through the users API.</p>
              </div>
            </div>
            {isCurrentUser && (
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                You are editing your signed-in account. Role, status, lifecycle, and removal controls are locked to prevent self-demotion or self-removal.
              </div>
            )}

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Role</span>
                <select
                  value={formData.role}
                  disabled={isUserDetailBusy || isCurrentUser || !canManageUsers}
                  title={!canManageUsers ? managePermissionTitle : undefined}
                  onChange={(e) => {
                    if (isUserDetailBusy || isCurrentUser) return;
                    setFormData({ ...formData, role: e.target.value as UserRole });
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedRole.detail}</span>
              </label>

              <label className="block">
                <span className="text-sm font-medium">Status</span>
                <select
                  value={formData.status}
                  disabled={isUserDetailBusy || isCurrentUser || !canManageUsers}
                  title={!canManageUsers ? managePermissionTitle : undefined}
                  onChange={(e) => {
                    if (isUserDetailBusy || isCurrentUser) return;
                    setFormData({ ...formData, status: e.target.value as UserStatus });
                  }}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">{selectedStatus.detail}</span>
              </label>
            </div>
          </div>

          <div id="user-detail-permissions" className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-700">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Backend permission matrix</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Role defaults, status gates, and per-user overrides loaded from the users API.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadPermissionMatrix()}
                disabled={isLoadingPermissions || !canViewUsers}
                title={!canViewUsers ? viewPermissionTitle : undefined}
                iconStart={<RefreshCw className={cn('size-3.5', isLoadingPermissions && 'animate-spin')} />}
              >
                Refresh
              </Button>
            </div>

            {permissionError && (
              <div
                role="alert"
                data-testid="user-detail-matrix-permission-state"
                className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="flex gap-3">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-semibold">User permission matrix could not be verified</p>
                      <p className="mt-1 leading-6">{permissionError}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadPermissionMatrix()}
                      disabled={isLoadingPermissions || !canViewUsers}
                      aria-label="Retry loading selected user permissions"
                      className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw className={cn('size-3.5', isLoadingPermissions && 'animate-spin')} />
                      Retry permissions
                    </button>
                    <Link
                      to="/users"
                      className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus-ring"
                    >
                      Review users
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {permissionNotice && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {permissionNotice}
              </div>
            )}

            {isLoadingPermissions ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2" aria-label="Loading permission matrix">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-28 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : permissionMatrix ? (
              <>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-xs font-medium text-muted-foreground">Effective role</div>
                    <div className="mt-1 text-lg font-semibold text-foreground">{roleLabel(permissionMatrix.role)}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-xs font-medium text-muted-foreground">Status gate</div>
                    <div className={cn('mt-1 text-lg font-semibold', permissionMatrix.canSignIn ? 'text-emerald-700' : 'text-amber-700')}>
                      {permissionMatrix.canSignIn ? 'Can sign in' : `${permissionMatrix.status} only`}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-xs font-medium text-muted-foreground">Allowed capabilities</div>
                    <div className="mt-1 text-lg font-semibold text-foreground">
                      {permissionMatrix.summary.allowed}/{permissionMatrix.summary.total}
                    </div>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 xl:grid-cols-2">
                  {permissionMatrix.groups.map((group) => (
                    <PermissionMatrixGroup
                      key={group.key}
                      group={group}
                      savingPermissionKey={savingPermissionKey}
                      canManageUsers={canManageUsers}
                      disabledReason={managePermissionTitle}
                      onOverrideChange={savePermissionOverride}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-5">
                <EmptyState
                  icon={ShieldAlert}
                  title="Permission matrix unavailable"
                  description="Reload the user detail page or refresh permissions before changing role overrides."
                />
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Access summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Role</dt>
                <dd className="mt-1 font-semibold text-foreground">{selectedRole.label}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                <dd className="mt-1 font-semibold text-foreground">{selectedStatus.label}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Last activity</dt>
                <dd className="mt-1 text-foreground">{user.lastActive}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Pending changes</dt>
                <dd className="mt-1 text-foreground">
                  {hasUnsavedChanges ? pendingChanges.join(', ') : 'None'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <Clock3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Status outcome</h2>
                <p className="mt-1 text-sm text-muted-foreground">{STATUS_OUTCOMES[formData.status]}</p>
              </div>
            </div>
          </section>

          <section
            id="user-detail-api"
            className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
            role="group"
            aria-label="User detail API actions"
            aria-describedby={userDetailApiActionStatusId}
            data-testid="user-detail-api"
            data-action-state={userDetailHandoffActionDisabledReason ? 'blocked' : 'ready'}
            data-action-status={userDetailApiActionStatus}
          >
            <span id={userDetailApiActionStatusId} className="sr-only" data-testid="user-detail-api-action-status" aria-live="polite">
              {userDetailApiActionStatus}
            </span>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Code2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">API update</h2>
                <p className="mt-1 text-sm text-muted-foreground">Save sends this payload to the user detail endpoint.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyUserDetailText(userDetailUrl, 'User detail API URL')}
                disabled={isUserDetailBusy}
                title={userDetailHandoffActionDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailApiActionStatusId, userDetailApiActionStatus, userDetailHandoffActionDisabledReason)}
                iconStart={<Copy className="size-4" />}
                data-testid="user-detail-api-copy-url"
              >
                Copy URL
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyUserDetailText(userDetailHandoffText, 'User detail handoff manifest')}
                disabled={isUserDetailBusy}
                title={userDetailHandoffActionDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailApiActionStatusId, userDetailApiActionStatus, userDetailHandoffActionDisabledReason)}
                iconStart={<Copy className="size-4" />}
                data-testid="user-detail-api-copy-manifest"
              >
                Copy manifest
              </Button>
            </div>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
{JSON.stringify(updatePayload, null, 2)}
            </pre>
            <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              {hasUnsavedChanges
                ? `Save will persist ${pendingChanges.join(', ')}.`
                : 'No API update will be sent until this form changes.'}
            </div>
          </section>

          <section
            id="user-detail-activity"
            className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
            role="group"
            aria-label="User activity actions"
            aria-describedby={userDetailActivityActionStatusId}
            data-testid="user-detail-activity"
            data-action-state={userDetailActivityActionState}
            data-action-status={userDetailActivityActionStatus}
          >
            <span id={userDetailActivityActionStatusId} className="sr-only" data-testid="user-detail-activity-action-status" aria-live="polite">
              {userDetailActivityActionStatus}
            </span>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-sky-50 p-2 text-sky-700">
                  <History className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">User activity</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Create, update, lifecycle, and removal events for this account record.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadUserAuditLogs()}
                disabled={isLoadingUserAudit || !canExportActivity}
                title={userDetailActivityDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailActivityActionStatusId, userDetailActivityActionStatus, userDetailActivityDisabledReason)}
                iconStart={<RefreshCw className={cn('size-3.5', isLoadingUserAudit && 'animate-spin')} />}
                data-testid="user-detail-activity-refresh"
              >
                Refresh
              </Button>
            </div>

            {userAuditError && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {userAuditError}
              </div>
            )}

            <div className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end" data-testid="user-detail-activity-filters">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Action</span>
                <select
                  value={userAuditActionFilter}
                  onChange={(event) => setUserAuditActionFilter(event.target.value)}
                  disabled={isLoadingUserAudit || !canExportActivity}
                  title={userDetailActivityDisabledReason || undefined}
                  {...userDetailActionMetadata(userDetailActivityActionStatusId, userDetailActivityActionStatus, userDetailActivityDisabledReason)}
                  data-testid="user-detail-activity-filter-action"
                  className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {USER_AUDIT_ACTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Request ID</span>
                <input
                  type="search"
                  value={userAuditRequestIdDraft}
                  onChange={(event) => setUserAuditRequestIdDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyUserAuditFilters();
                    }
                  }}
                  disabled={isLoadingUserAudit || !canExportActivity}
                  title={userDetailActivityDisabledReason || undefined}
                  {...userDetailActionMetadata(userDetailActivityActionStatusId, userDetailActivityActionStatus, userDetailActivityDisabledReason)}
                  data-testid="user-detail-activity-filter-request"
                  placeholder="req_..."
                  className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={applyUserAuditFilters}
                  disabled={isLoadingUserAudit || !canExportActivity}
                  title={userDetailActivityDisabledReason || undefined}
                  {...userDetailActionMetadata(userDetailActivityActionStatusId, userDetailActivityActionStatus, userDetailActivityDisabledReason)}
                  data-testid="user-detail-activity-filter-apply"
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearUserAuditFilters}
                  disabled={isLoadingUserAudit || !canExportActivity || (userAuditActionFilter === 'all' && !userAuditRequestIdDraft && !userAuditRequestIdFilter)}
                  title={userDetailActivityClearDisabledReason || undefined}
                  {...userDetailActionMetadata(userDetailActivityActionStatusId, userDetailActivityActionStatus, userDetailActivityClearDisabledReason)}
                  data-testid="user-detail-activity-filter-clear"
                >
                  Clear
                </Button>
              </div>
              <p className="md:col-span-3 text-xs leading-5 text-muted-foreground">
                Showing {userAuditLogs.length} event{userAuditLogs.length === 1 ? '' : 's'}
                {userAuditActionFilter !== 'all' ? ` for ${USER_AUDIT_ACTION_OPTIONS.find((option) => option.value === userAuditActionFilter)?.label.toLowerCase() || userAuditActionFilter}` : ''}
                {userAuditRequestIdFilter ? ` matching request ${userAuditRequestIdFilter}` : ''}.
              </p>
            </div>

            {isLoadingUserAudit ? (
              <div className="mt-4 space-y-2" aria-label="Loading user activity">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : userAuditLogs.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={History}
                  title="No matching user activity"
                  description="Adjust the action, request ID, or activity filter to review this user's audit events."
                />
              </div>
            ) : (
              <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
                <div className="space-y-2" data-testid="user-detail-activity-results">
                  {userAuditLogs.map((log) => (
                    <UserDetailAuditEvent
                      key={log.id}
                      log={log}
                      isSelected={selectedUserAuditLog?.id === log.id}
                      onSelect={() => setSelectedUserAuditLogId(log.id)}
                    />
                  ))}
                </div>
                <UserDetailAuditEventDetail log={selectedUserAuditLog} />
              </div>
            )}
          </section>

          <section
            id="user-detail-sessions"
            className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
            role="group"
            aria-label="Admin session actions"
            aria-describedby={userDetailSessionsActionStatusId}
            data-testid="user-detail-sessions"
            data-action-state={userDetailSessionsActionState}
            data-action-status={userDetailSessionsActionStatus}
          >
            <span id={userDetailSessionsActionStatusId} className="sr-only" data-testid="user-detail-sessions-action-status" aria-live="polite">
              {userDetailSessionsActionStatus}
            </span>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
                  <Monitor className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Admin sessions</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Active local-demo sessions for this account. Current sessions are protected from accidental revocation.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadUserSessions()}
                disabled={isLoadingSessions || !canManageUsers}
                title={userDetailSessionsRefreshDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailSessionsActionStatusId, userDetailSessionsActionStatus, userDetailSessionsRefreshDisabledReason)}
                iconStart={<RefreshCw className={cn('size-3.5', isLoadingSessions && 'animate-spin')} />}
                data-testid="user-detail-sessions-refresh"
              >
                Refresh
              </Button>
            </div>

            {sessionNotice && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {sessionNotice}
              </div>
            )}

            {isLoadingSessions ? (
              <div className="mt-4 space-y-2" aria-label="Loading admin sessions">
                {[0, 1].map((index) => (
                  <div key={index} className="h-20 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : userSessions.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon={Monitor}
                  title="No active admin sessions"
                  description="Accepted invites and successful sign-ins will appear here with revocation controls."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {userSessions.map((session) => (
                  <AdminSessionCard
                    key={session.id}
                    session={session}
                    isRevoking={revokingSessionId === session.id}
                    canManageUsers={canManageUsers}
                    disabledReason={managePermissionTitle}
                    actionStatusId={userDetailSessionsActionStatusId}
                    actionStatus={userDetailSessionsActionStatus}
                    onRevoke={() => void revokeSession(session)}
                  />
                ))}
              </div>
            )}
          </section>

          <section
            id="user-detail-recovery"
            className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
            role="group"
            aria-label="User recovery and lifecycle actions"
            aria-describedby={userDetailRecoveryActionStatusId}
            data-testid="user-detail-recovery"
            data-action-state={userDetailRecoveryActionState}
            data-action-status={userDetailRecoveryActionStatus}
          >
            <span id={userDetailRecoveryActionStatusId} className="sr-only" data-testid="user-detail-recovery-action-status" aria-live="polite">
              {userDetailRecoveryActionStatus}
            </span>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Account recovery</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate invite or reset links, queue transactional email delivery, and keep permission-gated copy actions as a backup.
                </p>
              </div>
            </div>
            {inviteTokenNotice && (
              <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                {inviteTokenNotice}
              </div>
            )}
            {resetTokenNotice && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {resetTokenNotice}
              </div>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium">Invite link expires</span>
                <select
                  aria-label="Invite link expiry"
                  value={inviteExpiresInMinutes}
                  disabled={Boolean(inviteExpiryDisabledReason)}
                  title={inviteExpiryDisabledReason || undefined}
                  {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, inviteExpiryDisabledReason)}
                  onChange={(event) => setInviteExpiresInMinutes(Number(event.target.value))}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {INVITE_EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">Used when generating or resending an invite link.</span>
              </label>
              <label className="block">
                <span className="text-sm font-medium">Reset link expires</span>
                <select
                  aria-label="Reset link expiry"
                  value={resetExpiresInMinutes}
                  disabled={Boolean(resetExpiryDisabledReason)}
                  title={resetExpiryDisabledReason || undefined}
                  {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, resetExpiryDisabledReason)}
                  onChange={(event) => setResetExpiresInMinutes(Number(event.target.value))}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {RESET_EXPIRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span className="mt-2 block text-xs leading-5 text-muted-foreground">Shorter reset links reduce credential recovery exposure.</span>
              </label>
            </div>
            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void createInviteToken()}
                disabled={!canCreateInviteToken}
                title={inviteTokenActionDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, inviteTokenActionDisabledReason)}
                iconStart={<Mail className="size-4" />}
                data-testid="user-detail-generate-invite-link"
              >
                {isCreatingInviteToken ? 'Generating...' : inviteToken ? 'Generate new invite link' : 'Generate invite link'}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void createResetToken()}
                disabled={!canCreateResetToken}
                title={resetTokenActionDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, resetTokenActionDisabledReason)}
                iconStart={<KeyRound className="size-4" />}
                data-testid="user-detail-generate-reset-token"
              >
                {isCreatingResetToken ? 'Generating...' : passwordResetToken ? 'Generate new reset token' : 'Generate reset token'}
              </Button>
              <a
                href={resetMailTo}
                aria-disabled={Boolean(recoveryDeliveryActionDisabledReason)}
                {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, recoveryDeliveryActionDisabledReason)}
                data-testid="user-detail-email-reset-instructions"
                className={cn(
                  'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring',
                  recoveryDeliveryActionDisabledReason && 'pointer-events-none opacity-60',
                )}
              >
                <Mail className="h-4 w-4" />
                Email reset instructions
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            {inviteToken ? (
              <div className="mt-4 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Latest invite link</div>
                    <div className="mt-1 font-mono text-xs font-semibold text-foreground">{inviteToken.id}</div>
                  </div>
                  <span className="rounded bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                    Manual delivery
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt>Expires</dt>
                    <dd className="font-medium text-foreground">{formatAuditDate(inviteToken.expiresAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Email</dt>
                    <dd className="truncate font-medium text-foreground">{inviteToken.email}</dd>
                  </div>
                </dl>
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-2 text-[11px] leading-5 text-muted-foreground">
                  <div className="font-medium text-foreground">Invite URL hidden</div>
                  <div className="mt-1 font-mono">{maskSecret(inviteToken.token)}</div>
                  <div className="mt-1">Use the copy action below for manual delivery.</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyUserDetailText(inviteToken.inviteUrl, 'Invite URL')}
                    disabled={Boolean(recoveryDeliveryActionDisabledReason)}
                    title={recoveryDeliveryActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, recoveryDeliveryActionDisabledReason)}
                    iconStart={<Copy className="size-3.5" />}
                    data-testid="user-detail-copy-invite-url"
                  >
                    Copy invite URL
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyUserDetailText(inviteToken.token, 'Invite token')}
                    disabled={Boolean(recoveryDeliveryActionDisabledReason)}
                    title={recoveryDeliveryActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, recoveryDeliveryActionDisabledReason)}
                    iconStart={<Copy className="size-3.5" />}
                    data-testid="user-detail-copy-invite-token"
                  >
                    Copy invite token
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={Mail}
                  title="No invite link generated"
                  description="Set the account to invited, choose an expiry window, then generate a manual invite link."
                />
              </div>
            )}
            {passwordResetToken ? (
              <div className="mt-4 rounded-lg border border-border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">Latest reset token</div>
                    <div className="mt-1 font-mono text-xs font-semibold text-foreground">{passwordResetToken.id}</div>
                  </div>
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    Manual delivery
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt>Expires</dt>
                    <dd className="font-medium text-foreground">{formatAuditDate(passwordResetToken.expiresAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Email</dt>
                    <dd className="truncate font-medium text-foreground">{passwordResetToken.email}</dd>
                  </div>
                </dl>
                <div className="mt-3 rounded-lg border border-border bg-muted/40 p-2 text-[11px] leading-5 text-muted-foreground">
                  <div className="font-medium text-foreground">Reset URL hidden</div>
                  <div className="mt-1 font-mono">{maskSecret(passwordResetToken.token)}</div>
                  <div className="mt-1">Use the copy action below for manual delivery.</div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyUserDetailText(passwordResetToken.resetUrl, 'Reset URL')}
                    disabled={Boolean(recoveryDeliveryActionDisabledReason)}
                    title={recoveryDeliveryActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, recoveryDeliveryActionDisabledReason)}
                    iconStart={<Copy className="size-3.5" />}
                    data-testid="user-detail-copy-reset-url"
                  >
                    Copy reset URL
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyUserDetailText(passwordResetToken.token, 'Reset token')}
                    disabled={Boolean(recoveryDeliveryActionDisabledReason)}
                    title={recoveryDeliveryActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, recoveryDeliveryActionDisabledReason)}
                    iconStart={<Copy className="size-3.5" />}
                    data-testid="user-detail-copy-reset-token"
                  >
                    Copy token
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={KeyRound}
                  title="No reset token generated"
                  description="Generate a reset token when this account needs a manually delivered recovery link."
                />
              </div>
            )}
            {(formData.status === 'inactive' || formData.status === 'suspended') && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Activate or invite this account before issuing a new reset token.
              </div>
            )}
            {formData.status !== 'invited' && (
              <div className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Set this account to invited before issuing a new invite link.
              </div>
            )}
            <div className="mt-4 grid gap-2">
              {LIFECYCLE_ACTIONS.map((action) => {
                const active = action.status === formData.status;
                const lifecycleActionDisabledReason = getLifecycleActionDisabledReason(action.status);
                return (
                  <button
                    key={action.status}
                    type="button"
                    onClick={() => void handleLifecycleAction(action.status)}
                    disabled={isUserDetailBusy || active || isCurrentUser || !canManageUsers}
                    title={lifecycleActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailRecoveryActionStatusId, userDetailRecoveryActionStatus, lifecycleActionDisabledReason)}
                    data-testid={`user-detail-lifecycle-${action.status}`}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                      active ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:bg-accent',
                    )}
                  >
                    <span className="block font-medium">{action.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{action.detail}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            id="user-detail-mfa"
            className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
            role="group"
            aria-label="User MFA actions"
            aria-describedby={userDetailMfaActionStatusId}
            data-testid="user-detail-mfa"
            data-action-state={userDetailMfaActionState}
            data-action-status={userDetailMfaActionStatus}
          >
            <span id={userDetailMfaActionStatusId} className="sr-only" data-testid="user-detail-mfa-action-status" aria-live="polite">
              {userDetailMfaActionStatus}
            </span>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Per-user MFA</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Require a second factor for this account and issue one-time recovery codes for lockout recovery.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadUserMfa()}
                disabled={isLoadingUserMfa || !canViewUsers}
                title={mfaRefreshActionDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailMfaActionStatusId, userDetailMfaActionStatus, mfaRefreshActionDisabledReason)}
                iconStart={<RefreshCw className={cn('size-3.5', isLoadingUserMfa && 'animate-spin')} />}
                data-testid="user-detail-mfa-refresh"
              >
                Refresh
              </Button>
            </div>

            {mfaNotice && (
              <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800" data-testid="user-detail-mfa-notice">
                {mfaNotice}
              </div>
            )}

            {isLoadingUserMfa ? (
              <div className="mt-4 space-y-2" aria-label="Loading user MFA">
                {[0, 1].map((index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Status</div>
                    <div className="mt-2 text-sm font-semibold text-foreground" data-testid="user-detail-mfa-status">
                      {userMfa?.enabled ? 'Enabled' : 'Disabled'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Recovery codes</div>
                    <div className="mt-2 text-sm font-semibold text-foreground" data-testid="user-detail-mfa-recovery-count">
                      {userMfa?.recoveryCodesRemaining || 0} remaining
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3">
                    <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Issued</div>
                    <div className="mt-2 text-sm font-semibold text-foreground">
                      {userMfa?.recoveryCodesIssuedAt ? formatAuditDate(userMfa.recoveryCodesIssuedAt) : 'Not issued'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={userMfa?.enabled ? 'outline' : 'primary'}
                    onClick={() => void saveUserMfa({ enabled: !userMfa?.enabled })}
                    disabled={!canManageUserMfa}
                    title={mfaManageActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailMfaActionStatusId, userDetailMfaActionStatus, mfaManageActionDisabledReason)}
                    iconStart={<Shield className="size-4" />}
                    data-testid="user-detail-mfa-toggle"
                  >
                    {isSavingUserMfa ? 'Saving...' : userMfa?.enabled ? 'Disable per-user MFA' : 'Enable per-user MFA'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveUserMfa({ enabled: true, generateRecoveryCodes: true })}
                    disabled={!canManageUserMfa}
                    title={mfaManageActionDisabledReason || undefined}
                    {...userDetailActionMetadata(userDetailMfaActionStatusId, userDetailMfaActionStatus, mfaManageActionDisabledReason)}
                    iconStart={<RefreshCw className="size-4" />}
                    data-testid="user-detail-mfa-generate-recovery"
                  >
                    Generate recovery codes
                  </Button>
                </div>

                {mfaRecoveryCodes.length > 0 && (
                  <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3" data-testid="user-detail-mfa-recovery-codes">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-emerald-950">Recovery codes shown once</div>
                        <div className="mt-1 text-xs leading-5 text-emerald-800">
                          Copy these codes before leaving this page. Backy stores only hashes.
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyUserDetailText(mfaRecoveryCodes.join('\n'), 'MFA recovery codes')}
                        disabled={Boolean(mfaRecoveryCopyDisabledReason)}
                        title={mfaRecoveryCopyDisabledReason || undefined}
                        {...userDetailActionMetadata(userDetailMfaActionStatusId, userDetailMfaActionStatus, mfaRecoveryCopyDisabledReason)}
                        iconStart={<Copy className="size-3.5" />}
                        data-testid="user-detail-mfa-copy-recovery"
                      >
                        Copy codes
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {mfaRecoveryCodes.map((code) => (
                        <code key={code} className="rounded border border-emerald-200 bg-white px-2 py-1 font-mono text-xs text-emerald-950">
                          {code}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {userMfa?.enabled && !userMfa.recoveryCodesRemaining && mfaRecoveryCodes.length === 0 && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Generate recovery codes before relying on this account-specific MFA requirement.
                  </div>
                )}
              </>
            )}
          </section>

          <section
            id="user-detail-ownership"
            className="rounded-lg border border-border bg-card p-5 shadow-sm scroll-mt-24"
            role="group"
            aria-label="User ownership transfer action"
            aria-describedby={userDetailOwnershipActionStatusId}
            data-testid="user-detail-ownership-transfer"
            data-action-state={ownershipTransferDisabledReason ? 'blocked' : 'ready'}
            data-action-status={userDetailOwnershipActionStatus}
          >
            <span id={userDetailOwnershipActionStatusId} className="sr-only" data-testid="user-detail-ownership-action-status" aria-live="polite">
              {userDetailOwnershipActionStatus}
            </span>
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-violet-50 p-2 text-violet-700">
                <Crown className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Ownership transfer</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Move workspace ownership to this active user through an audited owner-only action.
                </p>
              </div>
            </div>
            {ownershipTransferNotice && (
              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800">
                {ownershipTransferNotice}
              </div>
            )}
            <dl className="mt-4 grid gap-2 text-xs text-muted-foreground">
              <div className="flex justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <dt>Current signed-in owner</dt>
                <dd className="text-right font-medium text-foreground">{currentAdmin?.fullName || currentAdmin?.email || 'Unknown admin'}</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <dt>Transfer target</dt>
                <dd className="text-right font-medium text-foreground">{user.fullName} ({formData.status})</dd>
              </div>
              <div className="flex justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <dt>After transfer</dt>
                <dd className="text-right font-medium text-foreground">Target becomes owner; signed-in owner becomes admin.</dd>
              </div>
            </dl>
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full"
              onClick={() => void handleOwnershipTransfer()}
              disabled={!canTransferOwnership}
              title={ownershipTransferDisabledReason || undefined}
              {...userDetailActionMetadata(userDetailOwnershipActionStatusId, userDetailOwnershipActionStatus, ownershipTransferDisabledReason)}
              data-testid="user-detail-transfer-ownership-button"
              iconStart={<Crown className="size-4" />}
            >
              {isTransferringOwnership ? 'Transferring ownership...' : `Transfer ownership to ${user.fullName}`}
            </Button>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              This does not delete or suspend the previous owner. It preserves access by moving the previous owner to admin.
            </p>
          </section>

          <section
            id="user-detail-danger"
            className={cn(
              'rounded-lg border p-5 scroll-mt-24',
              isCurrentUser ? 'border-primary/20 bg-primary/10' : 'border-red-200 bg-red-50',
            )}
            role="group"
            aria-label="Destructive user actions"
            aria-describedby={userDetailDangerActionStatusId}
            data-testid="user-detail-danger"
            data-action-state={userDetailDangerActionDisabledReason ? 'blocked' : 'ready'}
            data-action-status={userDetailDangerActionStatus}
          >
            <span id={userDetailDangerActionStatusId} className="sr-only" data-testid="user-detail-danger-action-status" aria-live="polite">
              {userDetailDangerActionStatus}
            </span>
            <h2 className={cn('text-sm font-semibold', isCurrentUser ? 'text-primary' : 'text-red-800')}>Danger zone</h2>
            <p className={cn('mt-1 text-sm', isCurrentUser ? 'text-primary' : 'text-red-700')}>
              {isCurrentUser
                ? 'Self-removal is locked in the UI. Use another owner/admin account for destructive changes to your own access.'
                : 'Removing a user revokes their admin access. Backy prevents removing the last active owner or admin.'}
            </p>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isUserDetailBusy || isCurrentUser || !canDeleteUsers}
              title={userDetailDangerActionDisabledReason || undefined}
              {...userDetailActionMetadata(userDetailDangerActionStatusId, userDetailDangerActionStatus, userDetailDangerActionDisabledReason)}
              data-testid="user-detail-remove-user"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Remove user
            </button>
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              disabled={isUserDetailBusy || !canSaveUserDetail}
              title={userDetailSaveActionDisabledReason || undefined}
              {...userDetailActionMetadata(userDetailCommandActionStatusId, userDetailCommandActionStatus, userDetailSaveActionDisabledReason)}
              data-testid="user-detail-footer-save"
              className={cn(
                'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ring',
                'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
              )}
            >
              <Save className="h-4 w-4" />
              {isLoading ? 'Saving...' : isLoadingUser ? 'Loading user...' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isUserDetailBusy) {
                  navigate({ to: '/users' });
                }
              }}
              disabled={isUserDetailBusy}
              title={userDetailBusyDisabledReason || undefined}
              {...userDetailActionMetadata(userDetailCommandActionStatusId, userDetailCommandActionStatus, userDetailBusyDisabledReason)}
              data-testid="user-detail-footer-cancel"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            {hasUnsavedChanges && (
              <button
                type="button"
                onClick={resetForm}
                disabled={isUserDetailBusy || !canManageUsers}
                title={userDetailResetActionDisabledReason || undefined}
                {...userDetailActionMetadata(userDetailCommandActionStatusId, userDetailCommandActionStatus, userDetailResetActionDisabledReason)}
                data-testid="user-detail-footer-reset"
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset changes
              </button>
            )}
          </div>
        </aside>
        </div>
      </form>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-detail-delete-confirm-title"
          aria-describedby="user-detail-delete-confirm-description"
          data-testid="user-detail-delete-confirm-dialog"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-red-50 p-2 text-red-600">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h2 id="user-detail-delete-confirm-title" className="text-lg font-semibold text-foreground">Remove {user.fullName}?</h2>
                <p id="user-detail-delete-confirm-description" className="mt-1 text-sm text-muted-foreground">
                  This account will lose Backy admin access immediately. Content history stays intact.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isUserDetailBusy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isUserDetailBusy || !canDeleteUsers}
                title={userDetailDeletePermissionDisabledReason || userDetailBusyDisabledReason || undefined}
                aria-describedby="user-detail-delete-confirm-description"
                data-action-state={userDetailDeletePermissionDisabledReason || userDetailBusyDisabledReason ? 'blocked' : 'ready'}
                data-action-status={userDetailDangerActionStatus}
                data-disabled-reason={userDetailDeletePermissionDisabledReason || userDetailBusyDisabledReason || undefined}
                data-testid="user-detail-confirm-remove-user"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Removing...' : 'Remove user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function UserDetailAuditEvent({
  log,
  isSelected,
  onSelect,
}: {
  log: AdminAuditLog;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const email = readAuditString(log.metadata?.email) || readAuditString(log.after?.email) || readAuditString(log.before?.email) || log.entityId;
  const role = readAuditString(log.metadata?.role) || readAuditString(log.after?.role) || readAuditString(log.before?.role);
  const status = readAuditString(log.metadata?.status) || readAuditString(log.after?.status) || readAuditString(log.before?.status);
  const changedFields = Array.isArray(log.metadata?.changedFields)
    ? log.metadata.changedFields.filter((field): field is string => typeof field === 'string')
    : [];
  const actionLabel = log.action === 'create'
    ? 'Created'
    : log.action === 'delete'
      ? 'Removed'
      : log.action === 'update'
        ? 'Updated'
        : log.action === 'user.password_reset_token.create'
          ? 'Reset token'
          : log.action === 'user.invite_token.create'
            ? 'Invite link'
          : log.action;
  const actionTone = log.action === 'delete'
    ? 'bg-red-50 text-red-700'
    : log.action === 'create'
      ? 'bg-emerald-50 text-emerald-700'
      : log.action === 'user.password_reset_token.create'
        ? 'bg-amber-50 text-amber-700'
        : log.action === 'user.invite_token.create'
          ? 'bg-sky-50 text-sky-700'
        : 'bg-sky-50 text-sky-700';

  return (
    <article className={cn(
      'rounded-lg border bg-background p-3',
      isSelected ? 'border-primary shadow-sm ring-1 ring-primary/20' : 'border-border',
    )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'rounded px-2 py-0.5 text-[11px] font-semibold',
              actionTone,
            )}
            >
              {actionLabel}
            </span>
            <h3 className="truncate text-sm font-semibold text-foreground">{email}</h3>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {role ? `${roleLabel(role)} role` : 'User access'}{status ? ` - ${status}` : ''}
            {changedFields.length > 0 ? ` - changed ${changedFields.join(', ')}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">{formatAuditDate(log.createdAt)}</span>
          <Button
            type="button"
            size="sm"
            variant={isSelected ? 'secondary' : 'outline'}
            onClick={onSelect}
            data-testid="user-detail-activity-view-detail"
          >
            {isSelected ? 'Selected' : 'View detail'}
          </Button>
        </div>
      </div>
      {log.requestId && (
        <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
          request {log.requestId}
        </p>
      )}
    </article>
  );
}

function UserDetailAuditEventDetail({ log }: { log: AdminAuditLog | null }) {
  if (!log) {
    return (
      <aside data-testid="user-detail-activity-detail">
        <EmptyState
          icon={History}
          title="Select an activity event"
          description="Inspect request metadata, before and after snapshots, and structured audit context for the selected event."
        />
      </aside>
    );
  }

  const summaryItems = [
    { label: 'Action', value: log.action },
    { label: 'Entity', value: `${log.entity}:${log.entityId}` },
    { label: 'Actor', value: log.actorId || 'System or unavailable' },
    { label: 'Request', value: log.requestId || 'Not recorded' },
    { label: 'Site', value: log.siteId || 'Workspace global' },
    { label: 'Team', value: log.teamId || 'No team scope' },
    { label: 'Created', value: formatAuditDate(log.createdAt) },
  ];

  return (
    <aside className="rounded-lg border border-border bg-background p-3" data-testid="user-detail-activity-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Audit event detail</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Full structured payload for the selected user activity event.
          </p>
        </div>
        <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {log.id}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-xs">
        {summaryItems.map((item) => (
          <div key={item.label} className="grid gap-1 rounded-lg border border-border bg-card px-2.5 py-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
            <dt className="font-semibold uppercase tracking-normal text-muted-foreground">{item.label}</dt>
            <dd className="min-w-0 break-words font-medium text-foreground">{item.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 grid gap-3">
        <AuditJsonBlock title="Before" value={log.before} />
        <AuditJsonBlock title="After" value={log.after} />
        <AuditJsonBlock title="Metadata" value={log.metadata} />
      </div>
    </aside>
  );
}

function AuditJsonBlock({ title, value }: { title: string; value?: Record<string, unknown> }) {
  const json = formatAuditJson(value);
  const isEmpty = json === 'None';

  return (
    <section className="rounded-lg border border-border bg-card p-2.5">
      <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">{title}</div>
      <pre className={cn(
        'mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] leading-5',
        isEmpty ? 'text-muted-foreground' : 'text-foreground',
      )}
      >
{json}
      </pre>
    </section>
  );
}

function AdminSessionCard({
  session,
  isRevoking,
  canManageUsers,
  disabledReason,
  actionStatusId,
  actionStatus,
  onRevoke,
}: {
  session: AdminSessionSummary;
  isRevoking: boolean;
  canManageUsers: boolean;
  disabledReason?: string;
  actionStatusId: string;
  actionStatus: string;
  onRevoke: () => void;
}) {
  const revokeDisabledReason = session.current
    ? 'Current session is protected from revocation.'
    : !canManageUsers
      ? disabledReason || 'Your account cannot revoke user sessions.'
      : isRevoking
        ? 'Session revocation is already running.'
        : '';

  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
              {session.authMode}
            </span>
            {session.current && (
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Current session
              </span>
            )}
            <h3 className="font-mono text-xs font-semibold text-foreground">session ...{session.id}</h3>
          </div>
          <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
            <div className="flex justify-between gap-3">
              <dt>Last seen</dt>
              <dd className="font-medium text-foreground">{formatAuditDate(session.lastSeenAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Issued</dt>
              <dd>{formatAuditDate(session.issuedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Expires</dt>
              <dd>{formatAuditDate(session.expiresAt)}</dd>
            </div>
          </dl>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={session.current || isRevoking || !canManageUsers}
          title={revokeDisabledReason || undefined}
          {...userDetailActionMetadata(actionStatusId, actionStatus, revokeDisabledReason)}
          data-testid={`user-detail-session-revoke-${session.id}`}
          onClick={onRevoke}
          iconStart={<LogOut className="size-3.5" />}
        >
          {session.current ? 'Protected' : isRevoking ? 'Revoking...' : 'Revoke'}
        </Button>
      </div>
    </article>
  );
}

function PermissionMatrixGroup({
  group,
  savingPermissionKey,
  canManageUsers,
  disabledReason,
  onOverrideChange,
}: {
  group: AdminPermissionGroup;
  savingPermissionKey: string | null;
  canManageUsers: boolean;
  disabledReason?: string;
  onOverrideChange: (permissionKey: string, value: AdminPermissionOverrideValue | null) => void;
}) {
  const allowedCount = group.permissions.filter((permission) => permission.allowed).length;

  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{group.description}</p>
        </div>
        <span className={cn(
          'rounded px-2 py-0.5 text-[11px] font-semibold',
          allowedCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground',
        )}
        >
          {allowedCount}/{group.permissions.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {group.permissions.map((permission) => (
          <div
            key={permission.key}
            data-testid={`permission-${permission.key}`}
            className={cn(
              'grid gap-3 rounded-lg border px-2.5 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto]',
              permission.allowed
                ? 'border-emerald-200 bg-emerald-50/50 text-emerald-950'
                : 'border-border bg-muted/30 text-muted-foreground',
            )}
          >
            <div className="flex min-w-0 items-start gap-2">
              {permission.allowed ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="font-medium text-foreground">{permission.label}</div>
                <div className="mt-0.5 leading-5">{permission.reason}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-muted-foreground">
                    {permission.capability}
                  </span>
                  <span className={cn(
                    'rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal',
                    permission.source === 'override'
                      ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                      : permission.source === 'status'
                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                        : 'border-border bg-background text-muted-foreground',
                  )}
                  >
                    {permissionSourceLabel(permission.source)}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex h-8 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
              {[
                { label: 'Inherit', value: null, testId: 'inherit' },
                { label: 'Allow', value: 'allow' as const, testId: 'allow' },
                { label: 'Deny', value: 'deny' as const, testId: 'deny' },
              ].map((option) => {
                const selected = permission.override === option.value;
                const isSaving = savingPermissionKey === permission.key;

                return (
                  <button
                    key={option.testId}
                    type="button"
                    data-testid={`permission-${permission.key}-${option.testId}`}
                    aria-pressed={selected}
                    disabled={isSaving || !canManageUsers}
                    title={!canManageUsers ? disabledReason : undefined}
                    onClick={() => onOverrideChange(permission.key, option.value)}
                    className={cn(
                      'min-w-14 px-2 text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-60',
                      selected
                        ? 'bg-foreground text-background'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function permissionSourceLabel(source: 'role' | 'status' | 'override') {
  if (source === 'override') return 'Override';
  if (source === 'status') return 'Status';
  return 'Role';
}

function AccessReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        {ready ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        )}
        <div>
          <div className="text-sm font-semibold text-foreground">{label}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
        </div>
      </div>
    </div>
  );
}

const readAuditString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const roleLabel = (role: string): string => ROLE_OPTIONS.find((option) => option.value === role)?.label || role;

const formatAuditJson = (value?: Record<string, unknown>): string => {
  if (!value || Object.keys(value).length === 0) return 'None';

  return JSON.stringify(value, null, 2);
};

const formatAuditDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

function AccessWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {index}
      </span>
      <div>
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

import { createFileRoute } from '@tanstack/react-router';
import { Activity, Check, Copy, RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import TeamManagement, { type Team, type TeamRole } from '@/components/teams/TeamManagement';
import {
  createTeam,
  deleteTeam,
  getUserPermissions,
  inviteTeamMember,
  listAdminAuditLogs,
  listTeams,
  removeTeamMember,
  updateTeam,
  updateTeamMemberRole,
  type AdminAuditLog,
  type AdminTeam,
  type AdminInviteToken,
  type AdminUserDeliveryResult,
  type AdminUserPermissionMatrix,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { useAuthStore, type User as AuthUser } from '@/stores/authStore';

export const Route = createFileRoute('/teams')({
  component: TeamsPage,
});

const toTeam = (team: AdminTeam): Team => ({
  id: team.id,
  name: team.name,
  slug: team.slug,
  avatarUrl: team.avatarUrl || undefined,
  createdAt: team.createdAt,
  members: team.members.map((member) => ({
    id: member.id,
    userId: member.userId,
    email: member.email,
    name: member.name || member.email || member.userId,
    avatarUrl: member.avatarUrl || undefined,
    role: member.role,
    joinedAt: member.joinedAt,
  })),
  plan: team.plan,
  workspace: team.workspace,
});

type TeamPermissionKey = 'users.view' | 'users.manage' | 'activity.export';

const TEAM_PERMISSION_ROLE_DEFAULTS: Record<TeamPermissionKey, Array<AuthUser['role']>> = {
  'users.view': ['owner', 'admin'],
  'users.manage': ['owner', 'admin'],
  'activity.export': ['owner', 'admin'],
};

interface TeamInviteDeliveryResult {
  email: string;
  role: TeamRole;
  teamName: string;
  invite: AdminInviteToken;
  inviteDelivery?: AdminUserDeliveryResult | null;
}

function TeamsPage() {
  const currentAdmin = useAuthStore((state) => state.user);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [latestInviteDelivery, setLatestInviteDelivery] = useState<TeamInviteDeliveryResult | null>(null);
  const [copiedInviteUrl, setCopiedInviteUrl] = useState(false);
  const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [teamAuditLogs, setTeamAuditLogs] = useState<AdminAuditLog[]>([]);
  const [isLoadingTeamAudit, setIsLoadingTeamAudit] = useState(false);
  const [teamAuditError, setTeamAuditError] = useState<string | null>(null);

  const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
  const canViewTeams = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.view', TEAM_PERMISSION_ROLE_DEFAULTS);
  const canManageTeams = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'users.manage', TEAM_PERMISSION_ROLE_DEFAULTS);
  const canExportActivity = !isPermissionMatrixPending && isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'activity.export', TEAM_PERMISSION_ROLE_DEFAULTS);
  const viewPermissionTitle = canViewTeams ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.view', TEAM_PERMISSION_ROLE_DEFAULTS);
  const managePermissionTitle = canManageTeams ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'users.manage', TEAM_PERMISSION_ROLE_DEFAULTS);
  const activityPermissionTitle = canExportActivity ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'activity.export', TEAM_PERMISSION_ROLE_DEFAULTS);
  const isTeamsBusy = isLoading || isRefreshing || isPermissionMatrixPending;
  const isTeamAuditDisabled = isLoadingTeamAudit || isPermissionMatrixPending || !canExportActivity || !currentTeamId;

  const currentTeamExists = useMemo(
    () => teams.some((team) => team.id === currentTeamId),
    [currentTeamId, teams],
  );

  const loadTeams = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (isPermissionMatrixPending) return;
    if (!canViewTeams) {
      setTeams([]);
      setCurrentTeamId('');
      setError(viewPermissionTitle || 'Your account cannot view teams.');
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (mode === 'initial') {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError('');

    try {
      const loadedTeams = (await listTeams()).map(toTeam);
      setTeams(loadedTeams);
      setCurrentTeamId((previousTeamId) => {
        if (loadedTeams.some((team) => team.id === previousTeamId)) {
          return previousTeamId;
        }
        return loadedTeams[0]?.id || '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load teams');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [canViewTeams, isPermissionMatrixPending, viewPermissionTitle]);

  useEffect(() => {
    let cancelled = false;
    setPermissionError(null);

    if (!currentAdmin?.id) {
      setPermissionMatrix(null);
      setIsPermissionsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsPermissionsLoading(true);
    getUserPermissions(currentAdmin.id)
      .then((matrix) => {
        if (!cancelled) {
          setPermissionMatrix(matrix);
          setPermissionError(null);
        }
      })
      .catch((permissionsError) => {
        if (!cancelled) {
          setPermissionMatrix(null);
          setPermissionError(permissionsError instanceof Error ? permissionsError.message : 'Unable to load team permissions.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPermissionsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentAdmin?.id]);

  useEffect(() => {
    void loadTeams('initial');
  }, [loadTeams]);

  useEffect(() => {
    if (!currentTeamExists && teams.length > 0) {
      setCurrentTeamId(teams[0].id);
    }
  }, [currentTeamExists, teams]);

  const loadTeamAuditLogs = useCallback(async (teamId = currentTeamId) => {
    if (!teamId) {
      setTeamAuditLogs([]);
      setTeamAuditError(null);
      return;
    }
    if (!canExportActivity) {
      setTeamAuditLogs([]);
      setTeamAuditError(activityPermissionTitle || 'Your account cannot read team audit activity.');
      return;
    }

    setIsLoadingTeamAudit(true);
    setTeamAuditError(null);
    try {
      const result = await listAdminAuditLogs({ teamId, limit: 12 });
      setTeamAuditLogs(result.logs);
    } catch (auditError) {
      setTeamAuditLogs([]);
      setTeamAuditError(auditError instanceof Error ? auditError.message : 'Unable to load team activity.');
    } finally {
      setIsLoadingTeamAudit(false);
    }
  }, [activityPermissionTitle, canExportActivity, currentTeamId]);

  useEffect(() => {
    void loadTeamAuditLogs();
  }, [loadTeamAuditLogs]);

  const refreshAfterMutation = useCallback(async (message: string) => {
    await loadTeams();
    setNotice(message);
  }, [loadTeams]);

  const getTeamMemberMutationBlockReason = useCallback((teamId: string, memberId: string, nextRole?: TeamRole) => {
    const team = teams.find((candidate) => candidate.id === teamId);
    const member = team?.members.find((candidate) => candidate.id === memberId);
    if (!team || !member) {
      return 'Team member could not be found. Refresh teams and try again.';
    }

    const isCurrentAdminMember = Boolean(
      currentAdmin?.id && member.userId === currentAdmin.id,
    ) || Boolean(
      currentAdmin?.email && member.email.trim().toLowerCase() === currentAdmin.email.trim().toLowerCase(),
    );
    if (isCurrentAdminMember) {
      return 'Use another owner/admin account to change your own team membership.';
    }

    const ownerCount = team.members.filter((candidate) => candidate.role === 'owner').length;
    const demotesFinalOwner = member.role === 'owner' && nextRole !== 'owner';
    if (demotesFinalOwner && ownerCount <= 1) {
      return nextRole
        ? 'Add another owner before changing the final team owner role.'
        : 'Add another owner before removing the final team owner.';
    }

    return '';
  }, [currentAdmin?.email, currentAdmin?.id, teams]);

  const handleCreateTeam = useCallback(async (name: string) => {
    if (!canManageTeams) {
      throw new Error(managePermissionTitle || 'Your account cannot manage teams.');
    }
    const createdTeam = await createTeam({ name });
    const createdUiTeam = toTeam(createdTeam);
    setTeams((previousTeams) => [
      createdUiTeam,
      ...previousTeams.filter((team) => team.id !== createdUiTeam.id),
    ]);
    setCurrentTeamId(createdTeam.id);
    setLatestInviteDelivery(null);
    await refreshAfterMutation('Team created.');
    setCurrentTeamId(createdTeam.id);
    await loadTeamAuditLogs(createdTeam.id);
  }, [canManageTeams, loadTeamAuditLogs, managePermissionTitle, refreshAfterMutation]);

  const handleUpdateTeam = useCallback(async (teamId: string, updates: Partial<Team>) => {
    if (!canManageTeams) {
      throw new Error(managePermissionTitle || 'Your account cannot manage teams.');
    }
    await updateTeam(teamId, {
      name: updates.name,
      slug: updates.slug,
    });
    setLatestInviteDelivery(null);
    await refreshAfterMutation('Team saved.');
    await loadTeamAuditLogs(teamId);
  }, [canManageTeams, loadTeamAuditLogs, managePermissionTitle, refreshAfterMutation]);

  const handleDeleteTeam = useCallback(async (teamId: string) => {
    if (!canManageTeams) {
      throw new Error(managePermissionTitle || 'Your account cannot manage teams.');
    }
    await deleteTeam(teamId);
    setLatestInviteDelivery(null);
    await refreshAfterMutation('Team deleted.');
  }, [canManageTeams, managePermissionTitle, refreshAfterMutation]);

  const handleInviteMember = useCallback(async (teamId: string, email: string, role: TeamRole) => {
    if (!canManageTeams) {
      throw new Error(managePermissionTitle || 'Your account cannot manage teams.');
    }
    const result = await inviteTeamMember(teamId, { email, role });
    const teamName = teams.find((team) => team.id === teamId)?.name || 'Selected team';
    setLatestInviteDelivery(result.invite ? { email, role, teamName, invite: result.invite, inviteDelivery: result.inviteDelivery } : null);
    setCopiedInviteUrl(false);
    await refreshAfterMutation(
      result.invite?.inviteUrl
        ? result.invite.deliveryConfigured
          ? 'Team member invited and delivery was queued. Keep the link below as a manual backup.'
          : 'Invite created, but delivery is not configured. Copy the manual delivery link below.'
        : 'Team member invited.',
    );
    await loadTeamAuditLogs(teamId);
  }, [canManageTeams, loadTeamAuditLogs, managePermissionTitle, refreshAfterMutation, teams]);

  const copyLatestInviteUrl = useCallback(async () => {
    if (!latestInviteDelivery?.invite.inviteUrl) return;

    await navigator.clipboard.writeText(latestInviteDelivery.invite.inviteUrl);
    setCopiedInviteUrl(true);
    window.setTimeout(() => setCopiedInviteUrl(false), 1400);
  }, [latestInviteDelivery?.invite.inviteUrl]);

  const handleUpdateMemberRole = useCallback(async (teamId: string, memberId: string, role: TeamRole) => {
    if (!canManageTeams) {
      throw new Error(managePermissionTitle || 'Your account cannot manage teams.');
    }
    const blockReason = getTeamMemberMutationBlockReason(teamId, memberId, role);
    if (blockReason) {
      throw new Error(blockReason);
    }
    await updateTeamMemberRole(teamId, memberId, role);
    setLatestInviteDelivery(null);
    await refreshAfterMutation('Team member role updated.');
    await loadTeamAuditLogs(teamId);
  }, [canManageTeams, getTeamMemberMutationBlockReason, loadTeamAuditLogs, managePermissionTitle, refreshAfterMutation]);

  const handleRemoveMember = useCallback(async (teamId: string, memberId: string) => {
    if (!canManageTeams) {
      throw new Error(managePermissionTitle || 'Your account cannot manage teams.');
    }
    const blockReason = getTeamMemberMutationBlockReason(teamId, memberId);
    if (blockReason) {
      throw new Error(blockReason);
    }
    await removeTeamMember(teamId, memberId);
    setLatestInviteDelivery(null);
    await refreshAfterMutation('Team member removed.');
    await loadTeamAuditLogs(teamId);
  }, [canManageTeams, getTeamMemberMutationBlockReason, loadTeamAuditLogs, managePermissionTitle, refreshAfterMutation]);

  return (
    <PageShell
      title="Teams"
      description="Create teams, invite members, and manage workspace roles."
      action={(
        <Button
          variant="outline"
          iconStart={<RefreshCw className={isRefreshing ? 'size-4 animate-spin' : 'size-4'} />}
          onClick={() => void loadTeams()}
          disabled={isTeamsBusy || !canViewTeams}
          title={!canViewTeams ? viewPermissionTitle : undefined}
        >
          Refresh
        </Button>
      )}
    >
      <div className="space-y-4">
        {error && (
          <Notice tone="error" title="Teams unavailable">
            {error}
          </Notice>
        )}
        {permissionError && (
          <Notice tone="error" title="Team permissions unavailable">
            {permissionError}
          </Notice>
        )}
        {notice && (
          <Notice tone="success">
            {notice}
          </Notice>
        )}
        {latestInviteDelivery && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950" data-testid="team-invite-delivery-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">
                  {latestInviteDelivery.invite.deliveryConfigured ? 'Invite delivery queued' : 'Manual invite delivery'}
                </h2>
                <p className="mt-1 text-emerald-900/80">
                  {latestInviteDelivery.invite.deliveryConfigured
                    ? `Backy queued the invite email to ${latestInviteDelivery.email} for ${latestInviteDelivery.teamName} as ${latestInviteDelivery.role}.`
                    : `Send this link to ${latestInviteDelivery.email} for ${latestInviteDelivery.teamName} as ${latestInviteDelivery.role}.`}
                </p>
                <p className="mt-1 text-xs text-emerald-900/70">
                  {latestInviteDelivery.inviteDelivery
                    ? `Provider ${latestInviteDelivery.inviteDelivery.provider}, status ${latestInviteDelivery.inviteDelivery.status}. `
                    : ''}
                  Expires {new Date(latestInviteDelivery.invite.expiresAt).toLocaleString()}.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                iconStart={copiedInviteUrl ? <Check className="size-4" /> : <Copy className="size-4" />}
                onClick={() => void copyLatestInviteUrl()}
              >
                {copiedInviteUrl ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <p className="mt-3 break-all rounded-md border border-emerald-200 bg-white/70 px-3 py-2 font-mono text-xs">
              {latestInviteDelivery.invite.inviteUrl}
            </p>
          </div>
        )}
        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            Loading teams...
          </div>
        ) : teams.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No teams yet"
            description="Create a team to start assigning members, roles, sites, and workspace ownership. Team writes require database mode."
            action={(
              <div className="mt-2">
                <TeamManagement
                  teams={teams}
                  currentTeamId={currentTeamId}
                currentAdminId={currentAdmin?.id}
                currentAdminEmail={currentAdmin?.email}
                canManageTeams={canManageTeams}
                mutationDisabledReason={managePermissionTitle}
                isMutating={isTeamsBusy}
                onCreateTeam={handleCreateTeam}
                onUpdateTeam={handleUpdateTeam}
                onDeleteTeam={handleDeleteTeam}
                onInviteMember={handleInviteMember}
                onUpdateMemberRole={handleUpdateMemberRole}
                  onRemoveMember={handleRemoveMember}
                  onSwitchTeam={setCurrentTeamId}
                />
              </div>
            )}
          />
        ) : (
          <TeamManagement
            teams={teams}
            currentTeamId={currentTeamId}
            currentAdminId={currentAdmin?.id}
            currentAdminEmail={currentAdmin?.email}
            canManageTeams={canManageTeams}
            mutationDisabledReason={managePermissionTitle}
            isMutating={isTeamsBusy}
            onCreateTeam={handleCreateTeam}
            onUpdateTeam={handleUpdateTeam}
            onDeleteTeam={handleDeleteTeam}
            onInviteMember={handleInviteMember}
            onUpdateMemberRole={handleUpdateMemberRole}
            onRemoveMember={handleRemoveMember}
            onSwitchTeam={setCurrentTeamId}
          />
        )}
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm" data-testid="teams-audit-panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-border bg-muted/40 p-2 text-muted-foreground">
                <Activity className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Team activity</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Recent team and member mutations are read from admin audit logs for the selected workspace.
                </p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  Required permission: activity.export
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              iconStart={<RefreshCw className={isLoadingTeamAudit ? 'size-3.5 animate-spin' : 'size-3.5'} />}
              onClick={() => void loadTeamAuditLogs()}
              disabled={isTeamAuditDisabled}
              title={!canExportActivity ? activityPermissionTitle : undefined}
            >
              Refresh audit
            </Button>
          </div>
          {teamAuditError ? (
            <Notice tone="error" className="mt-4">
              {teamAuditError}
            </Notice>
          ) : isLoadingTeamAudit ? (
            <div className="mt-4 space-y-2" aria-label="Loading team activity">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-muted/50" />
              ))}
            </div>
          ) : teamAuditLogs.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={Activity}
                title="No team activity yet"
                description="Team creation, member invites, role changes, and workspace ownership updates will appear here."
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3" data-testid="teams-audit-list">
              {teamAuditLogs.map((log) => (
                <TeamAuditEvent key={log.id} log={log} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function TeamAuditEvent({ log }: { log: AdminAuditLog }) {
  const teamName = readAuditString(log.metadata?.teamName) || readAuditString(log.after?.name) || readAuditString(log.before?.name);
  const email = readAuditString(log.metadata?.email) || readAuditString(log.after?.email) || readAuditString(log.before?.email);
  const role = readAuditString(log.metadata?.role) || readAuditString(log.after?.role);
  const title = getTeamAuditTitle(log);

  return (
    <article className="rounded-lg border border-border bg-muted/20 p-4" data-testid={`teams-audit-event-${log.action}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {[teamName, email, role].filter(Boolean).join(' | ') || log.entityId}
          </div>
        </div>
        <time className="font-mono text-[11px] text-muted-foreground">{formatAuditDate(log.createdAt)}</time>
      </div>
      <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt className="font-medium text-foreground">Entity</dt>
          <dd>{log.entity}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Action</dt>
          <dd>{log.action}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Request</dt>
          <dd className="truncate font-mono">{log.requestId || 'n/a'}</dd>
        </div>
      </dl>
    </article>
  );
}

function getTeamAuditTitle(log: AdminAuditLog): string {
  if (log.entity === 'teamMember') {
    if (log.action === 'create') return 'Team member invited';
    if (log.action === 'update') return 'Team member role updated';
    if (log.action === 'delete') return 'Team member removed';
  }
  if (log.entity === 'team') {
    if (log.action === 'create') return 'Team created';
    if (log.action === 'update') return 'Team updated';
    if (log.action === 'delete') return 'Team deleted';
  }

  return `${log.entity}.${log.action}`;
}

const readAuditString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function formatAuditDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

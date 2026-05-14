import { createFileRoute } from '@tanstack/react-router';
import { RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import TeamManagement, { type Team, type TeamRole } from '@/components/teams/TeamManagement';
import {
  createTeam,
  deleteTeam,
  inviteTeamMember,
  listTeams,
  removeTeamMember,
  updateTeam,
  updateTeamMemberRole,
  type AdminTeam,
} from '@/lib/adminContentApi';

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
});

function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeamId, setCurrentTeamId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currentTeamExists = useMemo(
    () => teams.some((team) => team.id === currentTeamId),
    [currentTeamId, teams],
  );

  const loadTeams = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
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
  }, []);

  useEffect(() => {
    void loadTeams('initial');
  }, [loadTeams]);

  useEffect(() => {
    if (!currentTeamExists && teams.length > 0) {
      setCurrentTeamId(teams[0].id);
    }
  }, [currentTeamExists, teams]);

  const refreshAfterMutation = useCallback(async (message: string) => {
    await loadTeams();
    setNotice(message);
  }, [loadTeams]);

  const handleCreateTeam = useCallback(async (name: string) => {
    const createdTeam = await createTeam({ name });
    await refreshAfterMutation('Team created.');
    setCurrentTeamId(createdTeam.id);
  }, [refreshAfterMutation]);

  const handleUpdateTeam = useCallback(async (teamId: string, updates: Partial<Team>) => {
    await updateTeam(teamId, {
      name: updates.name,
      slug: updates.slug,
    });
    await refreshAfterMutation('Team saved.');
  }, [refreshAfterMutation]);

  const handleDeleteTeam = useCallback(async (teamId: string) => {
    await deleteTeam(teamId);
    await refreshAfterMutation('Team deleted.');
  }, [refreshAfterMutation]);

  const handleInviteMember = useCallback(async (teamId: string, email: string, role: TeamRole) => {
    const result = await inviteTeamMember(teamId, { email, role });
    await refreshAfterMutation(
      result.invite?.inviteUrl
        ? `Invite created. Local invite link: ${result.invite.inviteUrl}`
        : 'Team member invited.',
    );
  }, [refreshAfterMutation]);

  const handleUpdateMemberRole = useCallback(async (teamId: string, memberId: string, role: TeamRole) => {
    await updateTeamMemberRole(teamId, memberId, role);
    await refreshAfterMutation('Team member role updated.');
  }, [refreshAfterMutation]);

  const handleRemoveMember = useCallback(async (teamId: string, memberId: string) => {
    const confirmed = window.confirm('Remove this member from the team?');
    if (!confirmed) return;

    await removeTeamMember(teamId, memberId);
    await refreshAfterMutation('Team member removed.');
  }, [refreshAfterMutation]);

  return (
    <PageShell
      title="Teams"
      description="Create teams, invite members, and manage workspace roles."
      action={(
        <Button
          variant="outline"
          iconStart={<RefreshCw className={isRefreshing ? 'size-4 animate-spin' : 'size-4'} />}
          onClick={() => void loadTeams()}
          disabled={isLoading || isRefreshing}
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
        {notice && (
          <Notice tone="success">
            {notice}
          </Notice>
        )}
        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            Loading teams...
          </div>
        ) : teams.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center">
            <Users className="mb-3 size-8 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No teams yet</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Create a team to start assigning members and roles. Team writes require database mode.
            </p>
            <div className="mt-4">
              <TeamManagement
                teams={teams}
                currentTeamId={currentTeamId}
                onCreateTeam={handleCreateTeam}
                onUpdateTeam={handleUpdateTeam}
                onDeleteTeam={handleDeleteTeam}
                onInviteMember={handleInviteMember}
                onUpdateMemberRole={handleUpdateMemberRole}
                onRemoveMember={handleRemoveMember}
                onSwitchTeam={setCurrentTeamId}
              />
            </div>
          </div>
        ) : (
          <TeamManagement
            teams={teams}
            currentTeamId={currentTeamId}
            onCreateTeam={handleCreateTeam}
            onUpdateTeam={handleUpdateTeam}
            onDeleteTeam={handleDeleteTeam}
            onInviteMember={handleInviteMember}
            onUpdateMemberRole={handleUpdateMemberRole}
            onRemoveMember={handleRemoveMember}
            onSwitchTeam={setCurrentTeamId}
          />
        )}
      </div>
    </PageShell>
  );
}

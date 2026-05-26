/**
 * ==========================================================================
 * Team Management Component
 * ==========================================================================
 *
 * Multi-tenant team management UI:
 * - Create/edit teams
 * - Invite members
 * - Manage roles (owner, admin, editor, viewer)
 * - Remove members
 */

import React, { useState, useCallback } from 'react';

// ==========================================================================
// TYPES
// ==========================================================================

export type TeamRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface TeamMember {
    id: string;
    userId: string;
    email: string;
    name: string;
    avatarUrl?: string;
    role: TeamRole;
    joinedAt: string;
}

export interface Team {
    id: string;
    name: string;
    slug: string;
    avatarUrl?: string;
    createdAt: string;
    members: TeamMember[];
    plan?: 'free' | 'pro' | 'enterprise';
    workspace?: {
        siteCount: number;
        publishedSiteCount: number;
        draftSiteCount: number;
        archivedSiteCount: number;
        sites: Array<{
            id: string;
            name: string;
            slug: string;
            customDomain?: string | null;
            status: string;
            updatedAt?: string | null;
        }>;
    };
}

interface TeamManagementProps {
    teams: Team[];
    currentTeamId: string;
    currentAdminId?: string;
    currentAdminEmail?: string;
    canManageTeams?: boolean;
    mutationDisabledReason?: string;
    isMutating?: boolean;
    onCreateTeam: (name: string) => Promise<void>;
    onUpdateTeam: (teamId: string, updates: Partial<Team>) => Promise<void>;
    onDeleteTeam: (teamId: string) => Promise<void>;
    onInviteMember: (teamId: string, email: string, role: TeamRole) => Promise<void>;
    onUpdateMemberRole: (teamId: string, memberId: string, role: TeamRole) => Promise<void>;
    onRemoveMember: (teamId: string, memberId: string) => Promise<void>;
    onSwitchTeam: (teamId: string) => void;
}

// ==========================================================================
// STYLES
// ==========================================================================

const styles = {
    container: {
        padding: 0,
        width: '100%',
        maxWidth: 'none',
        margin: 0,
    } as React.CSSProperties,
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '16px',
        padding: '16px',
        border: '1px solid hsl(var(--border))',
        borderRadius: '8px',
        backgroundColor: 'hsl(var(--card))',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    } as React.CSSProperties,
    title: {
        fontSize: '18px',
        fontWeight: 700,
        color: 'hsl(var(--foreground))',
        margin: 0,
        letterSpacing: '0',
    } as React.CSSProperties,
    card: {
        backgroundColor: 'hsl(var(--card))',
        borderRadius: '8px',
        border: '1px solid hsl(var(--border))',
        padding: '16px',
        marginBottom: '16px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    } as React.CSSProperties,
    teamHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid hsl(var(--border))',
    } as React.CSSProperties,
    avatar: {
        width: '48px',
        height: '48px',
        borderRadius: '8px',
        backgroundColor: 'hsl(var(--muted))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        fontWeight: 600,
        color: 'hsl(var(--muted-foreground))',
    } as React.CSSProperties,
    teamInfo: {
        flex: 1,
    } as React.CSSProperties,
    teamName: {
        fontSize: '18px',
        fontWeight: 600,
        color: 'hsl(var(--foreground))',
    } as React.CSSProperties,
    teamSlug: {
        fontSize: '13px',
        color: 'hsl(var(--muted-foreground))',
    } as React.CSSProperties,
    badge: {
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 500,
    } as React.CSSProperties,
    memberRow: {
        display: 'flex',
        alignItems: 'center',
        padding: '12px 0',
        borderBottom: '1px solid hsl(var(--border))',
        gap: '12px',
        flexWrap: 'wrap',
    } as React.CSSProperties,
    memberAvatar: {
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        backgroundColor: 'hsl(var(--muted))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        fontWeight: 500,
        color: 'hsl(var(--muted-foreground))',
    } as React.CSSProperties,
    memberInfo: {
        flex: 1,
    } as React.CSSProperties,
    memberName: {
        fontSize: '14px',
        fontWeight: 500,
        color: 'hsl(var(--foreground))',
    } as React.CSSProperties,
    memberEmail: {
        fontSize: '12px',
        color: 'hsl(var(--muted-foreground))',
    } as React.CSSProperties,
    select: {
        padding: '6px 12px',
        border: '1px solid hsl(var(--input))',
        borderRadius: '6px',
        fontSize: '13px',
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
    } as React.CSSProperties,
    button: {
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        border: '1px solid transparent',
        minHeight: '36px',
    } as React.CSSProperties,
    primaryButton: {
        backgroundColor: 'hsl(var(--primary))',
        color: 'hsl(var(--primary-foreground))',
    } as React.CSSProperties,
    secondaryButton: {
        backgroundColor: 'hsl(var(--secondary))',
        color: 'hsl(var(--secondary-foreground))',
        borderColor: 'hsl(var(--border))',
    } as React.CSSProperties,
    dangerButton: {
        backgroundColor: 'hsl(var(--destructive) / 0.08)',
        color: 'hsl(var(--destructive))',
        borderColor: 'hsl(var(--destructive) / 0.22)',
    } as React.CSSProperties,
    input: {
        padding: '10px 12px',
        border: '1px solid hsl(var(--input))',
        borderRadius: '8px',
        fontSize: '14px',
        width: '100%',
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
    } as React.CSSProperties,
    modal: {
        position: 'fixed' as const,
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.44)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    } as React.CSSProperties,
    modalContent: {
        backgroundColor: 'hsl(var(--card))',
        borderRadius: '8px',
        padding: '24px',
        width: '100%',
        maxWidth: '400px',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
    } as React.CSSProperties,
};

const ROLE_BADGES: Record<TeamRole, { bg: string; color: string; label: string }> = {
    owner: { bg: '#fef3c7', color: '#92400e', label: 'Owner' },
    admin: { bg: '#dbeafe', color: '#1e40af', label: 'Admin' },
    editor: { bg: '#dcfce7', color: '#166534', label: 'Editor' },
    viewer: { bg: '#f3f4f6', color: '#374151', label: 'Viewer' },
};

const TEAM_INVITE_ROLES: TeamRole[] = ['viewer', 'editor', 'admin'];
const TEAM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const visuallyHiddenStyle: React.CSSProperties = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
};

const fieldErrorStyle: React.CSSProperties = {
    color: '#dc2626',
    fontSize: '12px',
    marginTop: '6px',
    marginBottom: 0,
};

const inlineAlertStyle: React.CSSProperties = {
    border: '1px solid #fecaca',
    backgroundColor: '#fef2f2',
    color: '#991b1b',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
    marginBottom: '12px',
};

const inputStyle = (hasError: boolean): React.CSSProperties => ({
    ...styles.input,
    ...(hasError ? {
        borderColor: '#dc2626',
        boxShadow: '0 0 0 1px #fecaca',
    } : {}),
});

const selectStyle = (hasError: boolean): React.CSSProperties => ({
    ...styles.select,
    width: '100%',
    ...(hasError ? {
        borderColor: '#dc2626',
        boxShadow: '0 0 0 1px #fecaca',
    } : {}),
});

const validateTeamName = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Team name is required.';
    if (trimmed.length < 2) return 'Team name must be at least 2 characters.';
    if (trimmed.length > 80) return 'Team name must be 80 characters or fewer.';
    return '';
};

const validateTeamSlug = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Team slug is required.';
    if (trimmed.length > 80) return 'Team slug must be 80 characters or fewer.';
    if (!TEAM_SLUG_PATTERN.test(trimmed)) {
        return 'Use lowercase letters, numbers, and single hyphens only.';
    }
    return '';
};

const validateTeamInviteEmail = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return 'Email address is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'Enter a valid email address.';
    return '';
};

const validateTeamInviteRole = (value: TeamRole): string => (
    TEAM_INVITE_ROLES.includes(value) ? '' : 'Choose viewer, editor, or admin for team invites.'
);

const actionState = (disabledReason?: string): 'blocked' | 'ready' => (disabledReason ? 'blocked' : 'ready');

const sanitizeActionId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '-');

// ==========================================================================
// SUB-COMPONENTS
// ==========================================================================

interface InviteModalProps {
    onClose: () => void;
    onInvite: (email: string, role: TeamRole) => Promise<void>;
}

function InviteModal({ onClose, onInvite }: InviteModalProps) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<TeamRole>('editor');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<{ email?: string; role?: string }>({});
    const normalizedEmail = email.trim().toLowerCase();
    const inviteSubmitEmailError = validateTeamInviteEmail(email);
    const inviteSubmitRoleError = validateTeamInviteRole(role);
    const inviteSubmitStatusId = 'teams-invite-submit-action-status';
    const inviteSubmitDisabledReason = isSubmitting ? 'Team invitation is already sending.' : '';
    const inviteSubmitActionState = inviteSubmitDisabledReason || inviteSubmitEmailError || inviteSubmitRoleError ? 'blocked' : 'ready';
    const inviteSubmitActionStatus = inviteSubmitDisabledReason
        ? `Send invite unavailable: ${inviteSubmitDisabledReason}`
        : inviteSubmitEmailError
            ? `Send invite needs a valid email address. ${inviteSubmitEmailError}`
            : inviteSubmitRoleError
                ? `Send invite needs a valid team role. ${inviteSubmitRoleError}`
                : `Send invite available for ${normalizedEmail} as ${role}.`;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nextErrors = {
            email: validateTeamInviteEmail(email),
            role: validateTeamInviteRole(role),
        };
        setFieldErrors(nextErrors);
        if (nextErrors.email || nextErrors.role) {
            setError('Fix invitation fields before sending.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            await onInvite(email.trim(), role);
            onClose();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to invite team member');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                    Invite Team Member
                </h3>
                <form onSubmit={handleSubmit} noValidate>
                    <span
                        id={inviteSubmitStatusId}
                        data-testid="teams-invite-submit-action-status"
                        aria-live="polite"
                        style={visuallyHiddenStyle}
                    >
                        {inviteSubmitActionStatus}
                    </span>
                    <div style={{ marginBottom: '16px' }}>
                        <label htmlFor="teams-invite-email-input" style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Email Address
                        </label>
                        <input
                            id="teams-invite-email-input"
                            data-testid="teams-invite-email-input"
                            type="email"
                            style={inputStyle(Boolean(fieldErrors.email))}
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                setFieldErrors((current) => ({ ...current, email: '' }));
                            }}
                            placeholder="colleague@company.com"
                            disabled={isSubmitting}
                            aria-invalid={Boolean(fieldErrors.email)}
                            aria-describedby={fieldErrors.email ? 'teams-invite-email-error' : undefined}
                        />
                        {fieldErrors.email && (
                            <p id="teams-invite-email-error" style={fieldErrorStyle}>
                                {fieldErrors.email}
                            </p>
                        )}
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label htmlFor="teams-invite-role-select" style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Role
                        </label>
                        <select
                            id="teams-invite-role-select"
                            data-testid="teams-invite-role-select"
                            style={selectStyle(Boolean(fieldErrors.role))}
                            value={role}
                            onChange={(e) => {
                                setRole(e.target.value as TeamRole);
                                setFieldErrors((current) => ({ ...current, role: '' }));
                            }}
                            disabled={isSubmitting}
                            aria-invalid={Boolean(fieldErrors.role)}
                            aria-describedby={fieldErrors.role ? 'teams-invite-role-error' : undefined}
                        >
                            <option value="viewer">Viewer - Can view sites</option>
                            <option value="editor">Editor - Can edit content</option>
                            <option value="admin">Admin - Full access except billing</option>
                        </select>
                        {fieldErrors.role && (
                            <p id="teams-invite-role-error" style={fieldErrorStyle}>
                                {fieldErrors.role}
                            </p>
                        )}
                    </div>
                    {error && (
                        <p role="alert" data-testid="teams-invite-inline-error" style={inlineAlertStyle}>
                            {error}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            style={{ ...styles.button, ...styles.secondaryButton }}
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            data-testid="teams-invite-submit"
                            type="submit"
                            style={{ ...styles.button, ...styles.primaryButton }}
                            disabled={isSubmitting}
                            title={inviteSubmitDisabledReason || undefined}
                            aria-describedby={inviteSubmitStatusId}
                            data-action-state={inviteSubmitActionState}
                            data-action-status={inviteSubmitActionStatus}
                            data-disabled-reason={inviteSubmitDisabledReason || undefined}
                            data-target-email={normalizedEmail || undefined}
                            data-target-role={role}
                        >
                            {isSubmitting ? 'Sending...' : 'Send Invite'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

interface CreateTeamModalProps {
    onClose: () => void;
    onCreate: (name: string) => Promise<void>;
}

function CreateTeamModal({ onClose, onCreate }: CreateTeamModalProps) {
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [nameError, setNameError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nextNameError = validateTeamName(name);
        setNameError(nextNameError);
        if (nextNameError) {
            setError('Fix team fields before creating.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            await onCreate(name.trim());
            onClose();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to create team');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                    Create New Team
                </h3>
                <form onSubmit={handleSubmit} noValidate>
                    <div style={{ marginBottom: '20px' }}>
                        <label htmlFor="teams-create-name-input" style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Team Name
                        </label>
                        <input
                            id="teams-create-name-input"
                            data-testid="teams-create-name-input"
                            type="text"
                            style={inputStyle(Boolean(nameError))}
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setNameError('');
                            }}
                            placeholder="My Awesome Team"
                            disabled={isSubmitting}
                            aria-invalid={Boolean(nameError)}
                            aria-describedby={nameError ? 'teams-create-name-error' : undefined}
                        />
                        {nameError && (
                            <p id="teams-create-name-error" style={fieldErrorStyle}>
                                {nameError}
                            </p>
                        )}
                    </div>
                    {error && (
                        <p role="alert" data-testid="teams-create-inline-error" style={inlineAlertStyle}>
                            {error}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            style={{ ...styles.button, ...styles.secondaryButton }}
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            data-testid="teams-create-submit"
                            type="submit"
                            style={{ ...styles.button, ...styles.primaryButton }}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Creating...' : 'Create Team'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

interface EditTeamModalProps {
    team: Team;
    onClose: () => void;
    onUpdate: (updates: Partial<Team>) => Promise<void>;
}

function EditTeamModal({ team, onClose, onUpdate }: EditTeamModalProps) {
    const [name, setName] = useState(team.name);
    const [slug, setSlug] = useState(team.slug);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState<{ name?: string; slug?: string }>({});

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const nextErrors = {
            name: validateTeamName(name),
            slug: validateTeamSlug(slug),
        };
        setFieldErrors(nextErrors);
        if (nextErrors.name || nextErrors.slug) {
            setError('Fix team fields before saving.');
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            await onUpdate({ name: name.trim(), slug: slug.trim() });
            onClose();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to save team');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                    Edit Team
                </h3>
                <form onSubmit={handleSubmit} noValidate>
                    <div style={{ marginBottom: '16px' }}>
                        <label htmlFor="teams-edit-name-input" style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Team Name
                        </label>
                        <input
                            id="teams-edit-name-input"
                            data-testid="teams-edit-name-input"
                            type="text"
                            style={inputStyle(Boolean(fieldErrors.name))}
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                setFieldErrors((current) => ({ ...current, name: '' }));
                            }}
                            disabled={isSubmitting}
                            aria-invalid={Boolean(fieldErrors.name)}
                            aria-describedby={fieldErrors.name ? 'teams-edit-name-error' : undefined}
                        />
                        {fieldErrors.name && (
                            <p id="teams-edit-name-error" style={fieldErrorStyle}>
                                {fieldErrors.name}
                            </p>
                        )}
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label htmlFor="teams-edit-slug-input" style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Slug
                        </label>
                        <input
                            id="teams-edit-slug-input"
                            data-testid="teams-edit-slug-input"
                            type="text"
                            style={inputStyle(Boolean(fieldErrors.slug))}
                            value={slug}
                            onChange={(e) => {
                                setSlug(e.target.value);
                                setFieldErrors((current) => ({ ...current, slug: '' }));
                            }}
                            disabled={isSubmitting}
                            aria-invalid={Boolean(fieldErrors.slug)}
                            aria-describedby={fieldErrors.slug ? 'teams-edit-slug-error' : undefined}
                        />
                        {fieldErrors.slug && (
                            <p id="teams-edit-slug-error" style={fieldErrorStyle}>
                                {fieldErrors.slug}
                            </p>
                        )}
                    </div>
                    {error && (
                        <p role="alert" data-testid="teams-edit-inline-error" style={inlineAlertStyle}>
                            {error}
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            style={{ ...styles.button, ...styles.secondaryButton }}
                            onClick={onClose}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            data-testid="teams-edit-submit"
                            type="submit"
                            style={{ ...styles.button, ...styles.primaryButton }}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Saving...' : 'Save Team'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ==========================================================================
// MAIN COMPONENT
// ==========================================================================

export function TeamManagement({
    teams,
    currentTeamId,
    currentAdminId,
    currentAdminEmail,
    canManageTeams = true,
    mutationDisabledReason = 'You do not have permission to manage teams.',
    isMutating = false,
    onCreateTeam,
    onUpdateTeam,
    onDeleteTeam,
    onInviteMember,
    onUpdateMemberRole,
    onRemoveMember,
    onSwitchTeam,
}: TeamManagementProps) {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editTeam, setEditTeam] = useState<Team | null>(null);
    const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);
    const [actionError, setActionError] = useState('');
    const [busyMemberAction, setBusyMemberAction] = useState<string | null>(null);
    const [pendingDeleteTeam, setPendingDeleteTeam] = useState<Team | null>(null);
    const [pendingRemoveMember, setPendingRemoveMember] = useState<{ team: Team; member: TeamMember } | null>(null);

    const currentTeam = teams.find((t) => t.id === currentTeamId);
    const mutationBusyReason = isMutating ? 'Team actions are temporarily unavailable while Backy syncs teams.' : '';
    const mutationPermissionReason = canManageTeams ? '' : mutationDisabledReason;
    const mutationBlockedReason = mutationBusyReason || mutationPermissionReason;
    const mutationsDisabled = Boolean(mutationBlockedReason);
    const mutationTitle = mutationBlockedReason || undefined;
    const normalizedCurrentAdminEmail = currentAdminEmail?.trim().toLowerCase() || '';
    const currentTeamSiteCount = currentTeam?.workspace?.siteCount || 0;
    const teamEditDisabledReason = mutationBlockedReason;
    const teamDeleteDisabledReason = currentTeamSiteCount > 0
        ? 'Move or delete this team\'s sites before deleting the team.'
        : mutationBlockedReason;
    const teamDeleteDisabled = Boolean(teamDeleteDisabledReason);
    const teamDeleteTitle = teamDeleteDisabledReason || undefined;
    const currentTeamActionStatus = [
        teamEditDisabledReason ? `Edit unavailable: ${teamEditDisabledReason}` : 'Edit available.',
        teamDeleteDisabledReason ? `Delete unavailable: ${teamDeleteDisabledReason}` : 'Delete available.',
    ].join(' ');
    const createTeamActionStatus = mutationBlockedReason
        ? `Create team unavailable: ${mutationBlockedReason}`
        : 'Create team available.';

    const memberMutationBlockReason = useCallback(
        (team: Team, member: TeamMember, action: 'role' | 'remove') => {
            const isCurrentAdminMember = Boolean(
                currentAdminId && member.userId === currentAdminId
            ) || Boolean(
                normalizedCurrentAdminEmail && member.email.trim().toLowerCase() === normalizedCurrentAdminEmail
            );
            if (isCurrentAdminMember) {
                return 'Use another owner/admin account to change your own team membership.';
            }

            const ownerCount = team.members.filter((candidate) => candidate.role === 'owner').length;
            if (member.role === 'owner' && ownerCount <= 1) {
                return action === 'remove'
                    ? 'Add another owner before removing the final team owner.'
                    : 'Add another owner before changing the final team owner role.';
            }

            return '';
        },
        [currentAdminId, normalizedCurrentAdminEmail]
    );

    const handleInvite = useCallback(
        async (email: string, role: TeamRole) => {
            if (!canManageTeams) {
                setActionError(mutationDisabledReason);
                return;
            }
            if (inviteTeamId) {
                await onInviteMember(inviteTeamId, email, role);
            }
        },
        [canManageTeams, inviteTeamId, mutationDisabledReason, onInviteMember]
    );

    const handleCreate = useCallback(
        async (name: string) => {
            if (!canManageTeams) {
                setActionError(mutationDisabledReason);
                return;
            }
            await onCreateTeam(name);
        },
        [canManageTeams, mutationDisabledReason, onCreateTeam]
    );

    const handleUpdate = useCallback(
        async (updates: Partial<Team>) => {
            if (!canManageTeams) {
                setActionError(mutationDisabledReason);
                return;
            }
            if (editTeam) {
                await onUpdateTeam(editTeam.id, updates);
            }
        },
        [canManageTeams, editTeam, mutationDisabledReason, onUpdateTeam]
    );

    const handleDelete = useCallback(
        async (team: Team) => {
            if (!canManageTeams) {
                setActionError(mutationDisabledReason);
                return;
            }
            setActionError('');
            try {
                await onDeleteTeam(team.id);
            } catch (deleteError) {
                setActionError(deleteError instanceof Error ? deleteError.message : 'Unable to delete team');
            }
        },
        [canManageTeams, mutationDisabledReason, onDeleteTeam]
    );

    const handleUpdateMemberRole = useCallback(
        async (teamId: string, memberId: string, role: TeamRole) => {
            if (!canManageTeams) {
                setActionError(mutationDisabledReason);
                return;
            }
            const actionId = `role:${memberId}`;
            setActionError('');
            setBusyMemberAction(actionId);
            try {
                await onUpdateMemberRole(teamId, memberId, role);
            } catch (updateError) {
                setActionError(updateError instanceof Error ? updateError.message : 'Unable to update team member role');
            } finally {
                setBusyMemberAction(null);
            }
        },
        [canManageTeams, mutationDisabledReason, onUpdateMemberRole]
    );

    const handleRemoveMember = useCallback(
        async (teamId: string, memberId: string) => {
            if (!canManageTeams) {
                setActionError(mutationDisabledReason);
                return;
            }
            const actionId = `remove:${memberId}`;
            setActionError('');
            setBusyMemberAction(actionId);
            try {
                await onRemoveMember(teamId, memberId);
            } catch (removeError) {
                setActionError(removeError instanceof Error ? removeError.message : 'Unable to remove team member');
            } finally {
                setBusyMemberAction(null);
            }
        },
        [canManageTeams, mutationDisabledReason, onRemoveMember]
    );

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div>
                    <h1 style={styles.title}>Team Management</h1>
                    <p style={{ margin: '4px 0 0', maxWidth: '620px', color: 'hsl(var(--muted-foreground))', fontSize: '13px', lineHeight: 1.5 }}>
                        Create teams, assign members, and keep workspace ownership tied to the right site portfolio.
                    </p>
                </div>
                <div
                    role="group"
                    aria-label="Team creation actions"
                    aria-describedby="teams-create-action-status"
                    data-testid="teams-create-actions"
                    data-action-status={createTeamActionStatus}
                >
                    <span
                        id="teams-create-action-status"
                        data-testid="teams-create-action-status"
                        aria-live="polite"
                        style={visuallyHiddenStyle}
                    >
                        {createTeamActionStatus}
                    </span>
                    <button
                        data-testid="teams-create-button"
                        style={{ ...styles.button, ...styles.primaryButton }}
                        onClick={() => setShowCreateModal(true)}
                        disabled={mutationsDisabled}
                        aria-describedby="teams-create-action-status"
                        aria-disabled={mutationsDisabled}
                        data-action-state={actionState(mutationBlockedReason)}
                        data-disabled-reason={mutationBlockedReason || undefined}
                        title={mutationTitle}
                    >
                        Create team
                    </button>
                </div>
            </div>

            {/* Team Selector */}
            <div style={{ marginBottom: '16px', display: 'grid', gap: '6px' }}>
                <label htmlFor="teams-current-select" style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                    Current Team
                </label>
                <select
                    id="teams-current-select"
                    data-testid="teams-current-select"
                    style={{ ...styles.select, width: 'min(100%, 360px)', padding: '10px 12px' }}
                    value={currentTeamId}
                    onChange={(e) => onSwitchTeam(e.target.value)}
                >
                    {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                            {team.name}
                        </option>
                    ))}
                </select>
            </div>

            {actionError && (
                <p style={{ color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
                    {actionError}
                </p>
            )}

            {/* Current Team Details */}
            {currentTeam && (
                <div style={styles.card}>
                    <div style={styles.teamHeader}>
                        <div style={styles.avatar}>
                            {currentTeam.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={currentTeam.avatarUrl}
                                    alt={currentTeam.name}
                                    style={{ width: '100%', height: '100%', borderRadius: '8px' }}
                                />
                            ) : (
                                currentTeam.name.charAt(0).toUpperCase()
                            )}
                        </div>
                        <div style={styles.teamInfo}>
                            <div style={styles.teamName}>{currentTeam.name}</div>
                            <div style={styles.teamSlug}>/{currentTeam.slug}</div>
                        </div>
                        {currentTeam.plan && (
                            <span
                                style={{
                                    ...styles.badge,
                                    backgroundColor:
                                        currentTeam.plan === 'enterprise'
                                            ? '#fef3c7'
                                            : currentTeam.plan === 'pro'
                                                ? '#dbeafe'
                                                : '#f3f4f6',
                                    color:
                                        currentTeam.plan === 'enterprise'
                                            ? '#92400e'
                                            : currentTeam.plan === 'pro'
                                                ? '#1e40af'
                                                : '#374151',
                                }}
                            >
                                {currentTeam.plan.charAt(0).toUpperCase() + currentTeam.plan.slice(1)}
                            </span>
                        )}
                        <div
                            role="group"
                            aria-label={`Actions for ${currentTeam.name}`}
                            aria-describedby="teams-current-actions-status"
                            data-testid="teams-current-actions"
                            data-action-status={currentTeamActionStatus}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                        >
                            <span
                                id="teams-current-actions-status"
                                data-testid="teams-current-actions-status"
                                aria-live="polite"
                                style={visuallyHiddenStyle}
                            >
                                {currentTeamActionStatus}
                            </span>
                            <button
                                data-testid="teams-edit-button"
                                style={{ ...styles.button, ...styles.secondaryButton }}
                                onClick={() => setEditTeam(currentTeam)}
                                disabled={mutationsDisabled}
                                aria-describedby="teams-current-actions-status"
                                aria-disabled={mutationsDisabled}
                                data-action-state={actionState(teamEditDisabledReason)}
                                data-disabled-reason={teamEditDisabledReason || undefined}
                                title={teamEditDisabledReason || 'Edit team'}
                            >
                                Edit
                            </button>
                            <button
                                data-testid="teams-delete-button"
                                style={{ ...styles.button, ...styles.dangerButton }}
                                onClick={() => setPendingDeleteTeam(currentTeam)}
                                disabled={teamDeleteDisabled}
                                aria-describedby="teams-current-actions-status"
                                aria-disabled={teamDeleteDisabled}
                                data-action-state={actionState(teamDeleteDisabledReason)}
                                data-disabled-reason={teamDeleteDisabledReason || undefined}
                                title={teamDeleteTitle || 'Delete team'}
                            >
                                Delete
                            </button>
                        </div>
                    </div>

                    <details
                        data-testid="teams-workspace-sites-details"
                        data-default-collapsed="true"
                        style={{
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            backgroundColor: 'hsl(var(--background))',
                            overflow: 'hidden',
                        }}
                    >
                        <summary
                            style={{
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '16px',
                                flexWrap: 'wrap',
                                padding: '14px 16px',
                                listStyle: 'none',
                            }}
                        >
                            <span>
                                <span style={{ display: 'block', fontSize: '15px', fontWeight: 700, color: 'hsl(var(--foreground))' }}>
                                    Workspace Sites
                                </span>
                                <span style={{ display: 'block', marginTop: '4px', fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
                                    Ownership gates deletion and keeps site workspaces attached to the right account.
                                </span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ ...styles.badge, backgroundColor: '#e0f2fe', color: '#075985' }}>
                                    {currentTeam.workspace?.siteCount || 0} total
                                </span>
                                <span style={{ ...styles.badge, backgroundColor: '#dcfce7', color: '#166534' }}>
                                    {currentTeam.workspace?.publishedSiteCount || 0} published
                                </span>
                                <span style={{ ...styles.badge, backgroundColor: '#fef3c7', color: '#92400e' }}>
                                    {currentTeam.workspace?.draftSiteCount || 0} draft
                                </span>
                                <span style={{ ...styles.badge, backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                                    Show sites
                                </span>
                            </span>
                        </summary>
                        <div
                            data-testid="teams-workspace-sites-panel"
                            style={{
                                borderTop: '1px solid hsl(var(--border))',
                                padding: '16px',
                            }}
                        >
                            {currentTeam.workspace?.sites?.length ? (
                                <div style={{ display: 'grid', gap: '8px' }}>
                                    {currentTeam.workspace.sites.map((site) => (
                                        <div
                                            key={site.id}
                                            data-testid={`teams-workspace-site-${site.id}`}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '12px',
                                                borderRadius: '6px',
                                                border: '1px solid hsl(var(--border))',
                                                backgroundColor: 'hsl(var(--card))',
                                                padding: '10px 12px',
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{site.name}</div>
                                                <div style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
                                                    /{site.slug}{site.customDomain ? ` | ${site.customDomain}` : ''}
                                                </div>
                                            </div>
                                            <span style={{ ...styles.badge, backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                                                {site.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ margin: 0, fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}>
                                    No sites are currently owned by this team.
                                </p>
                            )}
                        </div>
                    </details>

                    {/* Members List */}
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '12px',
                        }}
                    >
                        <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                            Team Members ({currentTeam.members.length})
                        </h3>
                        <div
                            role="group"
                            aria-label={`Member actions for ${currentTeam.name}`}
                            aria-describedby="teams-invite-action-status"
                            data-testid="teams-invite-actions"
                            data-action-status={mutationBlockedReason ? `Invite member unavailable: ${mutationBlockedReason}` : 'Invite member available.'}
                        >
                            <span
                                id="teams-invite-action-status"
                                data-testid="teams-invite-action-status"
                                aria-live="polite"
                                style={visuallyHiddenStyle}
                            >
                                {mutationBlockedReason ? `Invite member unavailable: ${mutationBlockedReason}` : 'Invite member available.'}
                            </span>
                            <button
                                data-testid="teams-invite-button"
                                style={{ ...styles.button, ...styles.primaryButton }}
                                onClick={() => {
                                    setInviteTeamId(currentTeam.id);
                                    setShowInviteModal(true);
                                }}
                                disabled={mutationsDisabled}
                                aria-describedby="teams-invite-action-status"
                                aria-disabled={mutationsDisabled}
                                data-action-state={actionState(mutationBlockedReason)}
                                data-disabled-reason={mutationBlockedReason || undefined}
                                title={mutationTitle || 'Invite member'}
                            >
                                + Invite Member
                            </button>
                        </div>
                    </div>

                    {currentTeam.members.map((member) => {
                        const memberActionStatusId = `teams-member-actions-status-${sanitizeActionId(member.id)}`;
                        const roleBlockReason = memberMutationBlockReason(currentTeam, member, 'role');
                        const removeBlockReason = memberMutationBlockReason(currentTeam, member, 'remove');
                        const roleBusyReason = busyMemberAction === `role:${member.id}`
                            ? 'Role update is in progress.'
                            : busyMemberAction === `remove:${member.id}`
                                ? 'Member removal is in progress.'
                                : '';
                        const removeBusyReason = busyMemberAction === `remove:${member.id}`
                            ? 'Member removal is in progress.'
                            : busyMemberAction === `role:${member.id}`
                                ? 'Role update is in progress.'
                                : '';
                        const roleDisabledReason = mutationBlockedReason || roleBlockReason || roleBusyReason;
                        const removeDisabledReason = mutationBlockedReason || removeBlockReason || removeBusyReason;
                        const roleDisabled = Boolean(roleDisabledReason);
                        const removeDisabled = Boolean(removeDisabledReason);
                        const memberActionStatus = [
                            roleDisabledReason ? `Role change unavailable: ${roleDisabledReason}` : 'Role change available.',
                            removeDisabledReason ? `Remove unavailable: ${removeDisabledReason}` : 'Remove available.',
                        ].join(' ');

                        return (
                        <div key={member.id} style={styles.memberRow}>
                            <div style={styles.memberAvatar}>
                                {member.avatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={member.avatarUrl}
                                        alt={member.name}
                                        style={{ width: '100%', height: '100%', borderRadius: '50%' }}
                                    />
                                ) : (
                                    member.name.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div style={styles.memberInfo}>
                                <div style={styles.memberName}>{member.name}</div>
                                <div style={styles.memberEmail}>{member.email}</div>
                            </div>
                            <span
                                style={{
                                    ...styles.badge,
                                    backgroundColor: ROLE_BADGES[member.role].bg,
                                    color: ROLE_BADGES[member.role].color,
                                }}
                            >
                                {ROLE_BADGES[member.role].label}
                            </span>
                            {member.role !== 'owner' && (
                                <div
                                    role="group"
                                    aria-label={`Actions for ${member.name}`}
                                    aria-describedby={memberActionStatusId}
                                    data-testid={`teams-member-actions-${member.id}`}
                                    data-action-status={memberActionStatus}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                                >
                                    <span
                                        id={memberActionStatusId}
                                        data-testid={`teams-member-actions-status-${member.id}`}
                                        aria-live="polite"
                                        style={visuallyHiddenStyle}
                                    >
                                        {memberActionStatus}
                                    </span>
                                    <select
                                        data-testid={`teams-member-role-${member.id}`}
                                        style={styles.select}
                                        value={member.role}
                                        onChange={(e) => handleUpdateMemberRole(currentTeam.id, member.id, e.target.value as TeamRole)}
                                        disabled={roleDisabled}
                                        aria-label={`Change role for ${member.name}`}
                                        aria-describedby={memberActionStatusId}
                                        aria-disabled={roleDisabled}
                                        data-action-state={actionState(roleDisabledReason)}
                                        data-disabled-reason={roleDisabledReason || undefined}
                                        title={roleDisabledReason || 'Change member role'}
                                    >
                                        <option value="viewer">Viewer</option>
                                        <option value="editor">Editor</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    <button
                                        data-testid={`teams-member-remove-${member.id}`}
                                        style={{ ...styles.button, ...styles.dangerButton }}
                                        onClick={() => setPendingRemoveMember({ team: currentTeam, member })}
                                        disabled={removeDisabled}
                                        aria-label={`Remove ${member.name} from ${currentTeam.name}`}
                                        aria-describedby={memberActionStatusId}
                                        aria-disabled={removeDisabled}
                                        data-action-state={actionState(removeDisabledReason)}
                                        data-disabled-reason={removeDisabledReason || undefined}
                                        title={removeDisabledReason || 'Remove member'}
                                    >
                                        {busyMemberAction === `remove:${member.id}` ? 'Removing...' : 'Remove'}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                    })}
                </div>
            )}

            {/* Modals */}
            {showInviteModal && (
                <InviteModal
                    onClose={() => setShowInviteModal(false)}
                    onInvite={handleInvite}
                />
            )}
            {showCreateModal && (
                <CreateTeamModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={handleCreate}
                />
            )}
            {editTeam && (
                <EditTeamModal
                    team={editTeam}
                    onClose={() => setEditTeam(null)}
                    onUpdate={handleUpdate}
                />
            )}
            {pendingDeleteTeam && (
                <div
                    style={styles.modal}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="teams-delete-team-title"
                    aria-describedby="teams-delete-team-description"
                    data-testid="teams-delete-team-confirmation"
                    onClick={() => {
                        if (!isMutating) setPendingDeleteTeam(null);
                    }}
                >
                    <div style={styles.modalContent} onClick={(event) => event.stopPropagation()}>
                        <h3 id="teams-delete-team-title" style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                            Delete {pendingDeleteTeam.name}?
                        </h3>
                        <p id="teams-delete-team-description" style={{ color: '#6b7280', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
                            This permanently removes the team shell after its workspace sites have been moved or deleted. Members keep their user accounts.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                style={{ ...styles.button, ...styles.secondaryButton }}
                                onClick={() => setPendingDeleteTeam(null)}
                                disabled={isMutating}
                                aria-label={`Cancel deleting team ${pendingDeleteTeam.name}`}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                data-testid="teams-delete-team-confirm"
                                style={{ ...styles.button, backgroundColor: '#dc2626', color: '#ffffff' }}
                                onClick={() => {
                                    const team = pendingDeleteTeam;
                                    void (async () => {
                                        await handleDelete(team);
                                        setPendingDeleteTeam(null);
                                    })();
                                }}
                                disabled={isMutating}
                                aria-label={`Confirm deleting team ${pendingDeleteTeam.name}`}
                            >
                                {isMutating ? 'Deleting...' : 'Delete team'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {pendingRemoveMember && (
                <div
                    style={styles.modal}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="teams-remove-member-title"
                    aria-describedby="teams-remove-member-description"
                    data-testid="teams-remove-member-confirmation"
                    onClick={() => {
                        if (!busyMemberAction) setPendingRemoveMember(null);
                    }}
                >
                    <div style={styles.modalContent} onClick={(event) => event.stopPropagation()}>
                        <h3 id="teams-remove-member-title" style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                            Remove {pendingRemoveMember.member.name}?
                        </h3>
                        <p id="teams-remove-member-description" style={{ color: '#6b7280', fontSize: '13px', lineHeight: 1.5, marginBottom: '16px' }}>
                            This removes {pendingRemoveMember.member.email} from {pendingRemoveMember.team.name}. Their user account remains available for other teams and future invites.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                style={{ ...styles.button, ...styles.secondaryButton }}
                                onClick={() => setPendingRemoveMember(null)}
                                disabled={Boolean(busyMemberAction)}
                                aria-label={`Cancel removing ${pendingRemoveMember.member.name}`}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                data-testid="teams-remove-member-confirm"
                                style={{ ...styles.button, backgroundColor: '#dc2626', color: '#ffffff' }}
                                onClick={() => {
                                    const pending = pendingRemoveMember;
                                    void (async () => {
                                        await handleRemoveMember(pending.team.id, pending.member.id);
                                        setPendingRemoveMember(null);
                                    })();
                                }}
                                disabled={Boolean(busyMemberAction)}
                                aria-label={`Confirm removing ${pendingRemoveMember.member.name}`}
                            >
                                {busyMemberAction === `remove:${pendingRemoveMember.member.id}` ? 'Removing...' : 'Remove member'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TeamManagement;

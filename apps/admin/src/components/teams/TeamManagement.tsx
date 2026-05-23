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
        padding: '24px',
        maxWidth: '900px',
        margin: '0 auto',
    } as React.CSSProperties,
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
    } as React.CSSProperties,
    title: {
        fontSize: '24px',
        fontWeight: 700,
        color: '#111827',
    } as React.CSSProperties,
    card: {
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: '20px',
        marginBottom: '16px',
    } as React.CSSProperties,
    teamHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '1px solid #e5e7eb',
    } as React.CSSProperties,
    avatar: {
        width: '48px',
        height: '48px',
        borderRadius: '8px',
        backgroundColor: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        fontWeight: 600,
        color: '#6b7280',
    } as React.CSSProperties,
    teamInfo: {
        flex: 1,
    } as React.CSSProperties,
    teamName: {
        fontSize: '18px',
        fontWeight: 600,
        color: '#111827',
    } as React.CSSProperties,
    teamSlug: {
        fontSize: '13px',
        color: '#6b7280',
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
        borderBottom: '1px solid #f3f4f6',
        gap: '12px',
    } as React.CSSProperties,
    memberAvatar: {
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        backgroundColor: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '14px',
        fontWeight: 500,
        color: '#6b7280',
    } as React.CSSProperties,
    memberInfo: {
        flex: 1,
    } as React.CSSProperties,
    memberName: {
        fontSize: '14px',
        fontWeight: 500,
        color: '#111827',
    } as React.CSSProperties,
    memberEmail: {
        fontSize: '12px',
        color: '#6b7280',
    } as React.CSSProperties,
    select: {
        padding: '6px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '6px',
        fontSize: '13px',
        backgroundColor: '#ffffff',
    } as React.CSSProperties,
    button: {
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        border: 'none',
    } as React.CSSProperties,
    primaryButton: {
        backgroundColor: '#3b82f6',
        color: 'white',
    } as React.CSSProperties,
    secondaryButton: {
        backgroundColor: '#f3f4f6',
        color: '#374151',
    } as React.CSSProperties,
    dangerButton: {
        backgroundColor: '#fef2f2',
        color: '#dc2626',
    } as React.CSSProperties,
    input: {
        padding: '10px 12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '14px',
        width: '100%',
    } as React.CSSProperties,
    modal: {
        position: 'fixed' as const,
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    } as React.CSSProperties,
    modalContent: {
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '24px',
        width: '100%',
        maxWidth: '400px',
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
    const mutationsDisabled = isMutating || !canManageTeams;
    const mutationTitle = canManageTeams ? undefined : mutationDisabledReason;
    const normalizedCurrentAdminEmail = currentAdminEmail?.trim().toLowerCase() || '';
    const currentTeamSiteCount = currentTeam?.workspace?.siteCount || 0;
    const teamDeleteDisabled = mutationsDisabled || currentTeamSiteCount > 0;
    const teamDeleteTitle = currentTeamSiteCount > 0
        ? 'Move or delete this team\'s sites before deleting the team.'
        : mutationTitle;

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
                <h1 style={styles.title}>Team Management</h1>
                <button
                    data-testid="teams-create-button"
                    style={{ ...styles.button, ...styles.primaryButton }}
                    onClick={() => setShowCreateModal(true)}
                    disabled={mutationsDisabled}
                    title={mutationTitle}
                >
                    + Create Team
                </button>
            </div>

            {/* Team Selector */}
            <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: '#6b7280' }}>
                    Current Team
                </label>
                <select
                    data-testid="teams-current-select"
                    style={{ ...styles.select, width: '300px', padding: '10px 12px' }}
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
                        <button
                            data-testid="teams-edit-button"
                            style={{ ...styles.button, ...styles.secondaryButton }}
                            onClick={() => setEditTeam(currentTeam)}
                            disabled={mutationsDisabled}
                            title={mutationTitle}
                        >
                            Edit
                        </button>
                        <button
                            data-testid="teams-delete-button"
                            style={{ ...styles.button, ...styles.dangerButton }}
                            onClick={() => setPendingDeleteTeam(currentTeam)}
                            disabled={teamDeleteDisabled}
                            title={teamDeleteTitle}
                        >
                            Delete
                        </button>
                    </div>

                    <div
                        data-testid="teams-workspace-sites-panel"
                        style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '8px',
                            padding: '16px',
                            marginBottom: '20px',
                            backgroundColor: '#f9fafb',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                                    Workspace Sites
                                </h3>
                                <p style={{ fontSize: '13px', color: '#6b7280' }}>
                                    Team ownership gates deletion and keeps site workspaces attached to the right account.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ ...styles.badge, backgroundColor: '#e0f2fe', color: '#075985' }}>
                                    {currentTeam.workspace?.siteCount || 0} total
                                </span>
                                <span style={{ ...styles.badge, backgroundColor: '#dcfce7', color: '#166534' }}>
                                    {currentTeam.workspace?.publishedSiteCount || 0} published
                                </span>
                                <span style={{ ...styles.badge, backgroundColor: '#fef3c7', color: '#92400e' }}>
                                    {currentTeam.workspace?.draftSiteCount || 0} draft
                                </span>
                            </div>
                        </div>
                        {currentTeam.workspace?.sites?.length ? (
                            <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
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
                                            border: '1px solid #e5e7eb',
                                            backgroundColor: '#ffffff',
                                            padding: '10px 12px',
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{site.name}</div>
                                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                /{site.slug}{site.customDomain ? ` | ${site.customDomain}` : ''}
                                            </div>
                                        </div>
                                        <span style={{ ...styles.badge, backgroundColor: '#f3f4f6', color: '#374151' }}>
                                            {site.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ marginTop: '12px', fontSize: '13px', color: '#6b7280' }}>
                                No sites are currently owned by this team.
                            </p>
                        )}
                    </div>

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
                        <button
                            data-testid="teams-invite-button"
                            style={{ ...styles.button, ...styles.primaryButton }}
                            onClick={() => {
                                setInviteTeamId(currentTeam.id);
                                setShowInviteModal(true);
                            }}
                            disabled={mutationsDisabled}
                            title={mutationTitle}
                        >
                            + Invite Member
                        </button>
                    </div>

                    {currentTeam.members.map((member) => {
                        const roleBlockReason = memberMutationBlockReason(currentTeam, member, 'role');
                        const removeBlockReason = memberMutationBlockReason(currentTeam, member, 'remove');
                        const roleDisabled = mutationsDisabled || Boolean(roleBlockReason) || busyMemberAction === `role:${member.id}` || busyMemberAction === `remove:${member.id}`;
                        const removeDisabled = mutationsDisabled || Boolean(removeBlockReason) || busyMemberAction === `role:${member.id}` || busyMemberAction === `remove:${member.id}`;

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
                                <>
                                    <select
                                        data-testid={`teams-member-role-${member.id}`}
                                        style={styles.select}
                                        value={member.role}
                                        onChange={(e) => handleUpdateMemberRole(currentTeam.id, member.id, e.target.value as TeamRole)}
                                        disabled={roleDisabled}
                                        title={roleBlockReason || mutationTitle}
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
                                        title={removeBlockReason || mutationTitle}
                                    >
                                        {busyMemberAction === `remove:${member.id}` ? 'Removing...' : 'Remove'}
                                    </button>
                                </>
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

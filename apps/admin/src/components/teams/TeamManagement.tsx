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
}

interface TeamManagementProps {
    teams: Team[];
    currentTeamId: string;
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

// ==========================================================================
// SUB-COMPONENTS
// ==========================================================================

interface InviteModalProps {
    onClose: () => void;
    onInvite: (email: string, role: TeamRole) => void;
}

function InviteModal({ onClose, onInvite }: InviteModalProps) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<TeamRole>('editor');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email) {
            onInvite(email, role);
            onClose();
        }
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                    Invite Team Member
                </h3>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            style={styles.input}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="colleague@company.com"
                            required
                        />
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Role
                        </label>
                        <select
                            style={{ ...styles.select, width: '100%' }}
                            value={role}
                            onChange={(e) => setRole(e.target.value as TeamRole)}
                        >
                            <option value="viewer">Viewer - Can view sites</option>
                            <option value="editor">Editor - Can edit content</option>
                            <option value="admin">Admin - Full access except billing</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            style={{ ...styles.button, ...styles.secondaryButton }}
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{ ...styles.button, ...styles.primaryButton }}
                        >
                            Send Invite
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

interface CreateTeamModalProps {
    onClose: () => void;
    onCreate: (name: string) => void;
}

function CreateTeamModal({ onClose, onCreate }: CreateTeamModalProps) {
    const [name, setName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name) {
            onCreate(name);
            onClose();
        }
    };

    return (
        <div style={styles.modal} onClick={onClose}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
                    Create New Team
                </h3>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                            Team Name
                        </label>
                        <input
                            type="text"
                            style={styles.input}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Awesome Team"
                            required
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            style={{ ...styles.button, ...styles.secondaryButton }}
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            style={{ ...styles.button, ...styles.primaryButton }}
                        >
                            Create Team
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
    onCreateTeam,
    onInviteMember,
    onUpdateMemberRole,
    onRemoveMember,
    onSwitchTeam,
}: TeamManagementProps) {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);

    const currentTeam = teams.find((t) => t.id === currentTeamId);

    const handleInvite = useCallback(
        async (email: string, role: TeamRole) => {
            if (inviteTeamId) {
                await onInviteMember(inviteTeamId, email, role);
            }
        },
        [inviteTeamId, onInviteMember]
    );

    const handleCreate = useCallback(
        async (name: string) => {
            await onCreateTeam(name);
        },
        [onCreateTeam]
    );

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>Team Management</h1>
                <button
                    style={{ ...styles.button, ...styles.primaryButton }}
                    onClick={() => setShowCreateModal(true)}
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
                            style={{ ...styles.button, ...styles.primaryButton }}
                            onClick={() => {
                                setInviteTeamId(currentTeam.id);
                                setShowInviteModal(true);
                            }}
                        >
                            + Invite Member
                        </button>
                    </div>

                    {currentTeam.members.map((member) => (
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
                                        style={styles.select}
                                        value={member.role}
                                        onChange={(e) =>
                                            onUpdateMemberRole(currentTeam.id, member.id, e.target.value as TeamRole)
                                        }
                                    >
                                        <option value="viewer">Viewer</option>
                                        <option value="editor">Editor</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    <button
                                        style={{ ...styles.button, ...styles.dangerButton }}
                                        onClick={() => onRemoveMember(currentTeam.id, member.id)}
                                    >
                                        Remove
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
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
        </div>
    );
}

export default TeamManagement;

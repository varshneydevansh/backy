import {
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type BackyTeamCreateInput,
    type BackyTeamListInput,
    type BackyTeamMemberAddInput,
    type BackyTeamMemberListInput,
    type BackyTeamMemberUpdateInput,
    type BackyTeamRepository,
    type BackyTeamUpdateInput,
    type BackyUserRole,
    type Team,
    type TeamMember,
    type TeamSettings,
} from '@backy-cms/core';
import { desc, eq } from 'drizzle-orm';
import { teamMembers, teams } from '../schema';
import type { DatabaseInstance } from '../adapters';

type QueryDatabase = {
    select: (...args: unknown[]) => {
        from: (table: unknown) => QueryBuilder;
    };
    insert: (table: unknown) => {
        values: (value: Record<string, unknown>) => ReturningQuery;
    };
    update: (table: unknown) => {
        set: (value: Record<string, unknown>) => {
            where: (condition: unknown) => ReturningQuery;
        };
    };
    delete: (table: unknown) => {
        where: (condition: unknown) => Promise<unknown>;
    };
};

type QueryBuilder = {
    where: (condition: unknown) => QueryBuilder;
    orderBy: (...columns: unknown[]) => QueryBuilder;
    limit: (limit: number) => QueryBuilder;
    offset: (offset: number) => QueryBuilder;
    then: Promise<unknown[]>['then'];
};

type ReturningQuery = {
    returning: () => Promise<unknown[]>;
};

type TeamRow = typeof teams.$inferSelect;
type TeamMemberRow = typeof teamMembers.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const asDb = (db: DatabaseInstance): QueryDatabase => db as unknown as QueryDatabase;

const toIso = (value: Date | string | null | undefined): string => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value || new Date().toISOString();
};

const normalizeLimit = (limit?: number): number => (
    Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit || DEFAULT_LIMIT)))
);

const normalizeOffset = (offset?: number): number => (
    Math.max(0, Math.floor(offset || 0))
);

const paginate = <TItem>(items: TItem[], limit?: number, offset?: number): BackyListResult<TItem> => {
    const normalizedLimit = normalizeLimit(limit);
    const normalizedOffset = normalizeOffset(offset);
    const pagedItems = items.slice(normalizedOffset, normalizedOffset + normalizedLimit);

    return {
        items: pagedItems,
        pagination: {
            total: items.length,
            limit: normalizedLimit,
            offset: normalizedOffset,
            hasMore: normalizedOffset + normalizedLimit < items.length,
        },
    };
};

const firstOrNull = async <TRow>(query: PromiseLike<unknown[]>): Promise<TRow | null> => {
    const rows = await query;
    return (rows[0] || null) as TRow | null;
};

const normalizeRole = (value: unknown): BackyUserRole => {
    if (value === 'owner' || value === 'admin' || value === 'editor' || value === 'viewer') {
        return value;
    }
    return 'viewer';
};

const searchText = (value: string | null | undefined, search: string): boolean => (
    (value || '').toLowerCase().includes(search.toLowerCase())
);

const normalizeSettings = (value: unknown): TeamSettings => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as TeamSettings
        : {}
);

const toTeam = (row: TeamRow): Team => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.ownerId || '',
    settings: normalizeSettings(row.settings),
    createdAt: toIso(row.createdAt),
});

const toTeamMember = (row: TeamMemberRow): TeamMember => ({
    id: row.id,
    teamId: row.teamId,
    userId: row.userId,
    role: normalizeRole(row.role),
    joinedAt: toIso(row.joinedAt),
});

export function createTeamRepository(db: DatabaseInstance): BackyTeamRepository {
    const database = asDb(db);

    return {
        async list(input: BackyTeamListInput = {}): Promise<BackyListResult<Team>> {
            const rows = await database.select().from(teams).orderBy(desc(teams.createdAt)) as TeamRow[];
            const filtered = rows
                .map(toTeam)
                .filter((team) => input.ownerId ? team.ownerId === input.ownerId : true)
                .filter((team) => input.search ? searchText(`${team.name} ${team.slug}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(teamId: string): Promise<Team | null> {
            const row = await firstOrNull<TeamRow>(
                database.select().from(teams).where(eq(teams.id, teamId)).limit(1),
            );
            return row ? toTeam(row) : null;
        },

        async getBySlug(slug: string): Promise<Team | null> {
            const normalizedSlug = slug.trim().toLowerCase();
            const rows = await database.select().from(teams).where(eq(teams.slug, normalizedSlug)).limit(1) as TeamRow[];
            const row = rows.find((item) => item.slug.toLowerCase() === normalizedSlug) || rows[0] || null;
            return row ? toTeam(row) : null;
        },

        async create(input: BackyTeamCreateInput): Promise<BackyRepositoryMutationResult<Team>> {
            const [row] = await database.insert(teams).values({
                name: input.name,
                slug: input.slug.trim().toLowerCase(),
                ownerId: input.ownerId || null,
                settings: input.settings || {},
            }).returning() as TeamRow[];
            return { item: toTeam(row) };
        },

        async update(teamId: string, input: BackyTeamUpdateInput): Promise<BackyRepositoryMutationResult<Team>> {
            const updates: Record<string, unknown> = {};
            if (input.name !== undefined) updates.name = input.name;
            if (input.slug !== undefined) updates.slug = input.slug.trim().toLowerCase();
            if (input.ownerId !== undefined) updates.ownerId = input.ownerId || null;
            if (input.settings !== undefined) updates.settings = input.settings || {};

            const [row] = await database.update(teams).set(updates).where(eq(teams.id, teamId)).returning() as TeamRow[];
            return { item: toTeam(row) };
        },

        async delete(teamId: string): Promise<boolean> {
            const existing = await this.getById(teamId);
            if (!existing) {
                return false;
            }

            await database.delete(teams).where(eq(teams.id, teamId));
            return true;
        },

        async listMembers(input: BackyTeamMemberListInput): Promise<BackyListResult<TeamMember>> {
            const rows = await database.select().from(teamMembers).where(eq(teamMembers.teamId, input.teamId)).orderBy(desc(teamMembers.joinedAt)) as TeamMemberRow[];
            const members = rows.map(toTeamMember);
            return paginate(members, MAX_LIMIT, 0);
        },

        async addMember(input: BackyTeamMemberAddInput): Promise<BackyRepositoryMutationResult<TeamMember>> {
            const existingMembers = await this.listMembers({ teamId: input.teamId });
            const existing = existingMembers.items.find((member) => member.userId === input.userId);
            if (existing) {
                return this.updateMember(input.teamId, existing.id, { role: input.role });
            }

            const [row] = await database.insert(teamMembers).values({
                teamId: input.teamId,
                userId: input.userId,
                role: input.role,
            }).returning() as TeamMemberRow[];
            return { item: toTeamMember(row) };
        },

        async updateMember(teamId: string, memberId: string, input: BackyTeamMemberUpdateInput): Promise<BackyRepositoryMutationResult<TeamMember>> {
            const existingMembers = await this.listMembers({ teamId });
            if (!existingMembers.items.some((member) => member.id === memberId)) {
                throw new Error(`Team member ${memberId} was not found`);
            }

            const [row] = await database.update(teamMembers).set({
                role: input.role,
            }).where(eq(teamMembers.id, memberId)).returning() as TeamMemberRow[];
            if (!row) {
                throw new Error(`Team member ${memberId} was not found`);
            }
            return { item: toTeamMember(row) };
        },

        async removeMember(teamId: string, memberId: string): Promise<boolean> {
            const members = await this.listMembers({ teamId });
            if (!members.items.some((member) => member.id === memberId)) {
                return false;
            }

            await database.delete(teamMembers).where(eq(teamMembers.id, memberId));
            return true;
        },
    };
}

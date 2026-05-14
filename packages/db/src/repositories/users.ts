import {
    type BackyListResult,
    type BackyRepositoryMutationResult,
    type BackyUser,
    type BackyUserCreateInput,
    type BackyUserListInput,
    type BackyUserPasswordCredential,
    type BackyUserPasswordCredentialInput,
    type BackyUserRepository,
    type BackyUserRole,
    type BackyUserStatus,
    type BackyUserUpdateInput,
} from '@backy-cms/core';
import { desc, eq } from 'drizzle-orm';
import { adminUserCredentials, profiles } from '../schema';
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

type UserRow = typeof profiles.$inferSelect;
type UserCredentialRow = typeof adminUserCredentials.$inferSelect;

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

const normalizeStatus = (row: Pick<UserRow, 'status' | 'isActive'>): BackyUserStatus => {
    if (
        row.status === 'active' ||
        row.status === 'inactive' ||
        row.status === 'invited' ||
        row.status === 'suspended'
    ) {
        return row.status;
    }
    return row.isActive ? 'active' : 'inactive';
};

const searchText = (value: string | null | undefined, search: string): boolean => (
    (value || '').toLowerCase().includes(search.toLowerCase())
);

const toUser = (row: UserRow): BackyUser => ({
    id: row.id,
    email: row.email,
    fullName: row.fullName || row.email,
    role: normalizeRole(row.role),
    status: normalizeStatus(row),
    avatarUrl: row.avatarUrl,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

const toCredential = (row: UserCredentialRow, user: Pick<BackyUser, 'email'>): BackyUserPasswordCredential => ({
    userId: row.userId,
    email: user.email,
    passwordHash: row.passwordHash,
    salt: row.salt,
    updatedAt: toIso(row.updatedAt),
});

export function createUserRepository(db: DatabaseInstance): BackyUserRepository {
    const database = asDb(db);

    return {
        async list(input: BackyUserListInput = {}): Promise<BackyListResult<BackyUser>> {
            const rows = await database.select().from(profiles).orderBy(desc(profiles.updatedAt)) as UserRow[];
            const filtered = rows
                .map(toUser)
                .filter((user) => input.role && input.role !== 'all' ? user.role === input.role : true)
                .filter((user) => input.status && input.status !== 'all' ? user.status === input.status : true)
                .filter((user) => input.search ? searchText(`${user.fullName} ${user.email}`, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(userId: string): Promise<BackyUser | null> {
            const row = await firstOrNull<UserRow>(
                database.select().from(profiles).where(eq(profiles.id, userId)).limit(1),
            );
            return row ? toUser(row) : null;
        },

        async getByEmail(email: string): Promise<BackyUser | null> {
            const normalizedEmail = email.trim().toLowerCase();
            const rows = await database.select().from(profiles).where(eq(profiles.email, normalizedEmail)).limit(1) as UserRow[];
            const row = rows.find((item) => item.email.toLowerCase() === normalizedEmail) || rows[0] || null;
            return row ? toUser(row) : null;
        },

        async getPasswordCredentialByEmail(email: string): Promise<BackyUserPasswordCredential | null> {
            const user = await this.getByEmail(email);
            if (!user) {
                return null;
            }

            const row = await firstOrNull<UserCredentialRow>(
                database.select().from(adminUserCredentials).where(eq(adminUserCredentials.userId, user.id)).limit(1),
            );
            return row ? toCredential(row, user) : null;
        },

        async setPasswordCredential(userId: string, input: BackyUserPasswordCredentialInput): Promise<BackyUserPasswordCredential> {
            const user = await this.getById(userId);
            if (!user) {
                throw new Error(`User ${userId} was not found`);
            }

            const existing = await firstOrNull<UserCredentialRow>(
                database.select().from(adminUserCredentials).where(eq(adminUserCredentials.userId, userId)).limit(1),
            );
            const updates = {
                passwordHash: input.passwordHash,
                salt: input.salt,
                updatedAt: new Date(),
            };
            const [row] = existing
                ? await database.update(adminUserCredentials).set(updates).where(eq(adminUserCredentials.userId, userId)).returning() as UserCredentialRow[]
                : await database.insert(adminUserCredentials).values({
                    userId,
                    ...updates,
                }).returning() as UserCredentialRow[];

            return toCredential(row, user);
        },

        async create(input: BackyUserCreateInput): Promise<BackyRepositoryMutationResult<BackyUser>> {
            const normalizedStatus = input.status || 'invited';
            const [row] = await database.insert(profiles).values({
                email: input.email.trim().toLowerCase(),
                fullName: input.fullName,
                role: input.role,
                status: normalizedStatus,
                isActive: normalizedStatus === 'active',
                updatedAt: new Date(),
            }).returning() as UserRow[];
            return { item: toUser(row) };
        },

        async update(userId: string, input: BackyUserUpdateInput): Promise<BackyRepositoryMutationResult<BackyUser>> {
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.email !== undefined) updates.email = input.email.trim().toLowerCase();
            if (input.fullName !== undefined) updates.fullName = input.fullName;
            if (input.role !== undefined) updates.role = input.role;
            if (input.status !== undefined) {
                updates.status = input.status;
                updates.isActive = input.status === 'active';
            }
            if (input.avatarUrl !== undefined) updates.avatarUrl = input.avatarUrl;

            const [row] = await database.update(profiles).set(updates).where(eq(profiles.id, userId)).returning() as UserRow[];
            return { item: toUser(row) };
        },

        async delete(userId: string): Promise<boolean> {
            const existing = await this.getById(userId);
            if (!existing) {
                return false;
            }

            await database.delete(profiles).where(eq(profiles.id, userId));
            return true;
        },
    };
}

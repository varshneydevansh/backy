import { commitBackyOperatorSiteGrantAuth, preserveBackyOperatorSiteGrants } from '@backy-cms/core';
import { randomUUID } from 'node:crypto';
import {
    type BackyJsonObject,
    type BackyRepositoryMutationResult,
    type BackySettings,
    type BackySettingsRepository,
    type BackySettingsUpdateInput,
} from '@backy-cms/core';
import { eq } from 'drizzle-orm';
import { platformSettings } from '../schema';
import type { DatabaseInstance } from '../adapters';

type QueryDatabase = {
    transaction: <T>(run: (transaction: QueryDatabase) => Promise<T>) => Promise<T>;
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
};

type QueryBuilder = {
    for: (mode: 'update') => QueryBuilder;
    where: (condition: unknown) => QueryBuilder;
    limit: (limit: number) => QueryBuilder;
    then: Promise<unknown[]>['then'];
};

type ReturningQuery = {
    onConflictDoNothing: () => ReturningQuery;
    returning: () => Promise<unknown[]>;
};

type SettingsRow = typeof platformSettings.$inferSelect;

const SETTINGS_ID = 'default';

const asDb = (db: DatabaseInstance): QueryDatabase => db as unknown as QueryDatabase;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const toIso = (value: Date | string | null | undefined): string => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return value || new Date().toISOString();
};

const normalizeDeliveryMode = (value: unknown): BackySettings['deliveryMode'] => {
    if (
        value === 'demo' ||
        value === 'database' ||
        value === 'managed-hosting' ||
        value === 'custom-frontend'
    ) {
        return value;
    }

    return 'managed-hosting';
};

const normalizeJsonObject = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const defaultApiKeys = (): BackySettings['apiKeys'] => ({
    publicKey: `pk_live_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    secretKeyId: `sk_live_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
});

const normalizeApiKeys = (value: unknown): BackySettings['apiKeys'] => {
    const input = normalizeJsonObject(value);
    return {
        publicKey: typeof input.publicKey === 'string' ? input.publicKey : undefined,
        secretKeyId: typeof input.secretKeyId === 'string' ? input.secretKeyId : undefined,
    };
};

const toSettings = (row: SettingsRow): BackySettings => ({
    deliveryMode: normalizeDeliveryMode(row.deliveryMode),
    apiKeys: normalizeApiKeys(row.apiKeys),
    storage: normalizeJsonObject(row.storage),
    auth: normalizeJsonObject(row.auth),
    integrations: normalizeJsonObject(row.integrations),
    updatedAt: toIso(row.updatedAt),
});

export function createSettingsRepository(db: DatabaseInstance): BackySettingsRepository {
    const database = asDb(db);

    const getOrCreateRow = async (query = database): Promise<SettingsRow> => {
        const rows = await query.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID)).limit(1) as SettingsRow[];
        if (rows[0]) {
            return rows[0];
        }

        const [row] = await query.insert(platformSettings).values({
            id: SETTINGS_ID,
            deliveryMode: 'managed-hosting',
            apiKeys: defaultApiKeys(),
            storage: {},
            auth: {},
            integrations: {},
            updatedAt: new Date(),
        }).onConflictDoNothing().returning() as SettingsRow[];
        if (row) return row;
        const [existing] = await query.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID)).limit(1) as SettingsRow[];
        if (!existing) throw new Error('Settings initialization failed');
        return existing;
    };

    return {
        async get(): Promise<BackySettings> {
            return toSettings(await getOrCreateRow());
        },

        async commitOperatorSiteGrant(input) {
            await getOrCreateRow();
            return database.transaction(async tx => {
                const [locked] = await tx.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID)).for('update') as SettingsRow[];
                if (!locked) throw new Error('Settings not found');
                const auth = commitBackyOperatorSiteGrantAuth(locked.auth, input);
                const [row] = await tx.update(platformSettings).set({ auth, updatedAt: new Date() }).where(eq(platformSettings.id, SETTINGS_ID)).returning() as SettingsRow[];
                return { item: toSettings(row) };
            });
        },

        async update(input: BackySettingsUpdateInput): Promise<BackyRepositoryMutationResult<BackySettings>> {
            await getOrCreateRow();
            return database.transaction(async tx => {
                const [locked] = await tx.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID)).for('update') as SettingsRow[];
                if (!locked) throw new Error('Settings not found');
                const current = toSettings(locked);
                const nextApiKeys = {
                    ...current.apiKeys,
                    ...(input.apiKeys || {}),
                    ...(input.rotatePublicKey ? { publicKey: defaultApiKeys().publicKey } : {}),
                    ...(input.rotateSecretKey ? { secretKeyId: defaultApiKeys().secretKeyId } : {}),
                };
                const updates: Record<string, unknown> = {
                    deliveryMode: input.deliveryMode || current.deliveryMode,
                    apiKeys: nextApiKeys,
                    storage: input.storage || current.storage || {},
                    auth: input.auth ? preserveBackyOperatorSiteGrants(current.auth, input.auth) : current.auth || {},
                    integrations: input.integrations || current.integrations || {},
                    updatedAt: new Date(),
                };

                const [row] = await tx.update(platformSettings).set(updates).where(eq(platformSettings.id, SETTINGS_ID)).returning() as SettingsRow[];
                return { item: toSettings(row) };
            });
        },
    };
}

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
    where: (condition: unknown) => QueryBuilder;
    limit: (limit: number) => QueryBuilder;
    then: Promise<unknown[]>['then'];
};

type ReturningQuery = {
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

    const getOrCreateRow = async (): Promise<SettingsRow> => {
        const rows = await database.select().from(platformSettings).where(eq(platformSettings.id, SETTINGS_ID)).limit(1) as SettingsRow[];
        if (rows[0]) {
            return rows[0];
        }

        const [row] = await database.insert(platformSettings).values({
            id: SETTINGS_ID,
            deliveryMode: 'managed-hosting',
            apiKeys: defaultApiKeys(),
            storage: {},
            auth: {},
            integrations: {},
            updatedAt: new Date(),
        }).returning() as SettingsRow[];
        return row;
    };

    return {
        async get(): Promise<BackySettings> {
            return toSettings(await getOrCreateRow());
        },

        async update(input: BackySettingsUpdateInput): Promise<BackyRepositoryMutationResult<BackySettings>> {
            const current = toSettings(await getOrCreateRow());
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
                auth: input.auth || current.auth || {},
                integrations: input.integrations || current.integrations || {},
                updatedAt: new Date(),
            };

            const [row] = await database.update(platformSettings).set(updates).where(eq(platformSettings.id, SETTINGS_ID)).returning() as SettingsRow[];
            return { item: toSettings(row) };
        },
    };
}

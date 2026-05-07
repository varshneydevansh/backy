import type { DatabaseConfig, DatabaseType } from './adapters';

export type BackyDataMode = 'database' | 'demo';

export interface BackyDataRuntimeConfig {
    mode: BackyDataMode;
    database?: DatabaseConfig;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DATABASE_TYPES = new Set<DatabaseType>(['postgres', 'mysql', 'sqlite']);

const valueFor = (env: Record<string, string | undefined>, key: string): string | undefined => {
    const value = env[key];
    return value && value.trim().length > 0 ? value.trim() : undefined;
};

const parseDataMode = (env: Record<string, string | undefined>): BackyDataMode => {
    const rawMode = valueFor(env, 'BACKY_DATA_MODE');
    if (rawMode) {
        if (rawMode === 'database' || rawMode === 'demo') {
            return rawMode;
        }
        throw new Error(`Unsupported BACKY_DATA_MODE "${rawMode}". Expected "database" or "demo".`);
    }

    const legacyDemoMode = valueFor(env, 'BACKY_DEMO_MODE');
    if (legacyDemoMode && TRUE_VALUES.has(legacyDemoMode.toLowerCase())) {
        return 'demo';
    }

    return 'database';
};

const parseDatabaseType = (env: Record<string, string | undefined>): DatabaseType => {
    const rawType = valueFor(env, 'BACKY_DATABASE_TYPE');
    if (!rawType) {
        return valueFor(env, 'DATABASE_URL')?.startsWith('mysql')
            ? 'mysql'
            : 'postgres';
    }

    if (!DATABASE_TYPES.has(rawType as DatabaseType)) {
        throw new Error(`Unsupported BACKY_DATABASE_TYPE "${rawType}". Expected postgres, mysql, or sqlite.`);
    }

    return rawType as DatabaseType;
};

export function resolveBackyDataRuntimeConfig(
    env: Record<string, string | undefined> = process.env,
): BackyDataRuntimeConfig {
    const mode = parseDataMode(env);

    if (mode === 'demo') {
        return { mode };
    }

    const type = parseDatabaseType(env);
    const config: DatabaseConfig = {
        type,
        logging: TRUE_VALUES.has((valueFor(env, 'BACKY_DATABASE_LOGGING') || '').toLowerCase()),
    };

    if (type === 'sqlite') {
        config.path = valueFor(env, 'BACKY_DATABASE_PATH') || valueFor(env, 'SQLITE_PATH') || ':memory:';
    } else {
        config.url = valueFor(env, 'BACKY_DATABASE_URL') || valueFor(env, 'DATABASE_URL');
        if (!config.url) {
            throw new Error('Database mode requires BACKY_DATABASE_URL or DATABASE_URL.');
        }
    }

    const name = valueFor(env, 'BACKY_DATABASE_NAME');
    if (name) {
        config.name = name;
    }

    return {
        mode,
        database: config,
    };
}

export function isBackyDemoModeEnabled(
    env: Record<string, string | undefined> = process.env,
): boolean {
    return resolveBackyDataRuntimeConfig(env).mode === 'demo';
}

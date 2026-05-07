import {
  createDatabaseRepositories,
} from '@backy/db/repositories';
import type { DatabaseAdapter, DatabaseConfig } from '@backy/db/adapters';
import {
  resolveBackyDataRuntimeConfig,
  type BackyDataRuntimeConfig,
} from '@backy/db/runtime-config';

type DatabaseRepositories = ReturnType<typeof createDatabaseRepositories>;
type DatabaseAdapterModule = {
  createDatabaseAdapter: (config: DatabaseConfig) => Promise<DatabaseAdapter>;
};
const importDatabaseAdapters = async (): Promise<DatabaseAdapterModule> => {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<DatabaseAdapterModule>;
  return dynamicImport('@backy/db/adapters');
};

export type PublicRepositoryRuntime =
  | {
      mode: 'database';
      repositories: DatabaseRepositories;
    }
  | {
      mode: 'demo';
      repositories: null;
      reason: string;
    };

let cachedRuntime: Promise<PublicRepositoryRuntime> | null = null;

export function resolvePublicRepositoryRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): BackyDataRuntimeConfig {
  return resolveBackyDataRuntimeConfig(env);
}

export async function createPublicRepositoryRuntime(
  config: BackyDataRuntimeConfig = resolvePublicRepositoryRuntimeConfig(),
): Promise<PublicRepositoryRuntime> {
  if (config.mode === 'demo') {
    return {
      mode: 'demo',
      repositories: null,
      reason: 'Explicit Backy demo mode',
    };
  }

  if (!config.database) {
    throw new Error('Database runtime mode requires a database configuration.');
  }

  const { createDatabaseAdapter } = await importDatabaseAdapters();
  const adapter = await createDatabaseAdapter(config.database);

  return {
    mode: 'database',
    repositories: createDatabaseRepositories({ adapter }),
  };
}

export function getPublicRepositoryRuntime(): Promise<PublicRepositoryRuntime> {
  cachedRuntime ||= createPublicRepositoryRuntime();
  return cachedRuntime;
}

export async function getRequiredDatabaseRepositories(): Promise<DatabaseRepositories> {
  const runtime = await getPublicRepositoryRuntime();

  if (runtime.mode !== 'database') {
    throw new Error('Database repositories are unavailable because Backy is running in explicit demo mode.');
  }

  return runtime.repositories;
}

export function resetPublicRepositoryRuntimeForTests(): void {
  cachedRuntime = null;
}

export function shouldUseDemoStoreFallback(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const explicitMode = env.BACKY_DATA_MODE;
  if (explicitMode === 'demo') {
    return true;
  }
  if (explicitMode === 'database') {
    return false;
  }
  if (env.BACKY_DEMO_MODE === 'true') {
    return true;
  }
  if (env.BACKY_DATABASE_URL || env.DATABASE_URL || env.BACKY_DATABASE_TYPE) {
    return false;
  }
  return env.NODE_ENV !== 'production';
}

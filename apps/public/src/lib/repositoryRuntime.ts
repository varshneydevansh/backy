import type { DatabaseAdapter, DatabaseConfig } from '@backy/db/adapters';
import {
  resolveBackyDataRuntimeConfig,
  type BackyDataRuntimeConfig,
} from '@backy/db/runtime-config';
import {
  assertProductionDemoModeAllowed,
  shouldUseDemoStoreFallback,
} from './repositoryRuntimePolicy';
export { shouldUseDemoStoreFallback } from './repositoryRuntimePolicy';

type DatabaseRepositories = ReturnType<typeof import('@backy/db/repositories').createDatabaseRepositories>;
type DatabaseAdapterModule = {
  createDatabaseAdapter: (config: DatabaseConfig) => Promise<DatabaseAdapter>;
};
type DatabaseRepositoryModule = {
  createDatabaseRepositories: (input: { adapter: DatabaseAdapter }) => DatabaseRepositories;
};
const importDatabaseAdapters = async (): Promise<DatabaseAdapterModule> => {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<DatabaseAdapterModule>;
  return dynamicImport('@backy/db/adapters');
};
const importDatabaseRepositories = async (): Promise<DatabaseRepositoryModule> => {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<DatabaseRepositoryModule>;
  return dynamicImport('@backy/db/repositories');
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
  const config = resolveBackyDataRuntimeConfig(env);
  assertProductionDemoModeAllowed(config.mode, env);

  return config;
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

  const [{ createDatabaseAdapter }, { createDatabaseRepositories }] = await Promise.all([
    importDatabaseAdapters(),
    importDatabaseRepositories(),
  ]);
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

export function setPublicRepositoryRuntimeForTests(runtime: PublicRepositoryRuntime): void {
  cachedRuntime = Promise.resolve(runtime);
}

import {
  createBackyRuntimeAdapter,
  createDatabaseRepositories,
  resolveBackyDataRuntimeConfig,
  type BackyDataRuntimeConfig,
} from '@backy/db';

type DatabaseRepositories = ReturnType<typeof createDatabaseRepositories>;

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
  const runtime = await createBackyRuntimeAdapter(config);

  if (runtime.mode === 'demo') {
    return {
      mode: 'demo',
      repositories: null,
      reason: runtime.adapter.reason || 'Explicit Backy demo mode',
    };
  }

  return {
    mode: 'database',
    repositories: createDatabaseRepositories({ adapter: runtime.adapter }),
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

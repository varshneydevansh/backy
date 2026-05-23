import type { DatabaseAdapter, DatabaseConfig } from '@backy/db/adapters';
import {
  resolveBackyDataRuntimeConfig,
  type BackyDataRuntimeConfig,
} from '@backy/db/runtime-config';
import {
  assertProductionDemoModeAllowed,
  shouldUseDemoStoreFallback,
} from './repositoryRuntimePolicy';
import {
  removeRepositoryCollectionRecordMediaReferences,
  removeRepositoryPageMediaReferences,
  removeRepositoryPostMediaReferences,
  syncRepositoryCollectionRecordMediaReferences,
  syncRepositoryPageMediaReferences,
  syncRepositoryPostMediaReferences,
} from './repositoryMediaReferenceSync';
export { shouldUseDemoStoreFallback } from './repositoryRuntimePolicy';

type DatabaseRepositories = ReturnType<typeof import('@backy/db/repositories').createDatabaseRepositories>;
type DatabaseAdapterModule = {
  createDatabaseAdapter: (config: DatabaseConfig) => Promise<DatabaseAdapter>;
};
type DatabaseRepositoryModule = {
  createDatabaseRepositories: (input: { adapter: DatabaseAdapter }) => DatabaseRepositories;
};

const withRepositoryMediaReferenceSync = (
  repositories: DatabaseRepositories,
): DatabaseRepositories => {
  const collections = repositories.collections;
  const pages = repositories.pages;
  const posts = repositories.posts;

  return {
    ...repositories,
    pages: {
      ...pages,
      async create(input, context) {
        const result = await pages.create(input, context);
        await syncRepositoryPageMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          pageId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
        });
        return result;
      },
      async update(siteId, pageId, input, context) {
        const result = await pages.update(siteId, pageId, input, context);
        await syncRepositoryPageMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          pageId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
        });
        return result;
      },
      async publish(siteId, pageId, context) {
        const result = await pages.publish(siteId, pageId, context);
        await syncRepositoryPageMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          pageId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
        });
        return result;
      },
      async archive(siteId, pageId, context) {
        const result = await pages.archive(siteId, pageId, context);
        await syncRepositoryPageMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          pageId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
        });
        return result;
      },
      async delete(siteId, pageId, context) {
        const existingPage = await pages.getById(siteId, pageId, context);
        const deleted = await pages.delete(siteId, pageId, context);
        if (deleted) {
          await removeRepositoryPageMediaReferences({
            mediaRepository: repositories.media,
            siteId,
            pageId: existingPage?.id || pageId,
          });
        }
        return deleted;
      },
    },
    posts: {
      ...posts,
      async create(input, context) {
        const result = await posts.create(input, context);
        await syncRepositoryPostMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          postId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
          featuredImageId: result.item.featuredImageId,
        });
        return result;
      },
      async update(siteId, postId, input, context) {
        const result = await posts.update(siteId, postId, input, context);
        await syncRepositoryPostMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          postId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
          featuredImageId: result.item.featuredImageId,
        });
        return result;
      },
      async publish(siteId, postId, context) {
        const result = await posts.publish(siteId, postId, context);
        await syncRepositoryPostMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          postId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
          featuredImageId: result.item.featuredImageId,
        });
        return result;
      },
      async archive(siteId, postId, context) {
        const result = await posts.archive(siteId, postId, context);
        await syncRepositoryPostMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          postId: result.item.id,
          content: result.item.content,
          meta: result.item.meta,
          featuredImageId: result.item.featuredImageId,
        });
        return result;
      },
      async delete(siteId, postId, context) {
        const existingPost = await posts.getById(siteId, postId, context);
        const deleted = await posts.delete(siteId, postId, context);
        if (deleted) {
          await removeRepositoryPostMediaReferences({
            mediaRepository: repositories.media,
            siteId,
            postId: existingPost?.id || postId,
          });
        }
        return deleted;
      },
    },
    collections: {
      ...collections,
      async createRecord(input, context) {
        const result = await collections.createRecord(input, context);
        await syncRepositoryCollectionRecordMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          collectionId: result.item.collectionId,
          recordId: result.item.id,
          values: result.item.values,
        });
        return result;
      },
      async updateRecord(siteId, collectionId, recordId, input, context) {
        const result = await collections.updateRecord(siteId, collectionId, recordId, input, context);
        await syncRepositoryCollectionRecordMediaReferences({
          mediaRepository: repositories.media,
          siteId: result.item.siteId,
          collectionId: result.item.collectionId,
          recordId: result.item.id,
          values: result.item.values,
        });
        return result;
      },
      async deleteRecord(siteId, collectionId, recordId, context) {
        const existingRecord = await collections.getRecordById(siteId, collectionId, recordId, context);
        const deleted = await collections.deleteRecord(siteId, collectionId, recordId, context);
        if (deleted) {
          await removeRepositoryCollectionRecordMediaReferences({
            mediaRepository: repositories.media,
            siteId,
            collectionId,
            recordId: existingRecord?.id || recordId,
          });
        }
        return deleted;
      },
    },
  };
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
    repositories: withRepositoryMediaReferenceSync(createDatabaseRepositories({ adapter })),
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

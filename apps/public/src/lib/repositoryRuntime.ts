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
  collectRepositoryMediaReferences,
  collectRepositoryCollectionRecordMediaReferences,
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
  admittedSiteId?: string,
): DatabaseRepositories => {
  // Internal only: this callback already holds the site-media admission in its
  // transaction. Do not open an ordinary outer/nested transaction.
  const assertAdmittedSite = (siteId: string) => {
    if (admittedSiteId !== undefined && siteId !== admittedSiteId) throw Object.assign(new Error('The admitted media writer is limited to its site.'), { code: 'MEDIA_REFERENCE_SCOPE_MISMATCH' });
  };
  const mutate = <T>(siteId: string, operation: (writer: DatabaseRepositories) => Promise<T>): Promise<T> => {
    assertAdmittedSite(siteId);
    if (admittedSiteId !== undefined) return operation(repositories);
    if (!repositories.withMediaReferenceMutation) throw Object.assign(new Error('Atomic media reference admission is unavailable.'), { code: 'MEDIA_STORAGE_LOCK_UNAVAILABLE' });
    return repositories.withMediaReferenceMutation(siteId, operation);
  };
  const validate = async (writer: DatabaseRepositories, siteId: string, value: unknown, references = collectRepositoryMediaReferences(value)) => {
    const checked = new Set<string>();
    for (const reference of references) {
      if (checked.has(reference.mediaId)) continue;
      const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference.mediaId);
      const media = validId ? await writer.media.getById(siteId, reference.mediaId) : null;
      if (!media || media.id !== reference.mediaId || media.siteId !== siteId) throw Object.assign(new Error('A managed media reference is unavailable for this site.'), {
        code: 'INVALID_EDITOR_MEDIA_REFERENCE', mediaId: reference.mediaId,
        path: reference.path === '/mediaId' ? '/featuredImageId' : reference.path,
      });
      checked.add(reference.mediaId);
    }
  };
  const pageSync = (writer: DatabaseRepositories, item: Awaited<ReturnType<DatabaseRepositories['pages']['getById']>>) => item
    ? syncRepositoryPageMediaReferences({ mediaRepository: writer.media, siteId: item.siteId, pageId: item.id, content: item.content, meta: item.meta }) : Promise.resolve();
  const postSync = (writer: DatabaseRepositories, item: Awaited<ReturnType<DatabaseRepositories['posts']['getById']>>) => item
    ? syncRepositoryPostMediaReferences({ mediaRepository: writer.media, siteId: item.siteId, postId: item.id, content: item.content, meta: item.meta, featuredImageId: item.featuredImageId }) : Promise.resolve();
  const recordWriter = (writer: DatabaseRepositories, collectionRepository = writer.collections): DatabaseRepositories['collections'] => ({
    ...collectionRepository,
    async createRecord(input, context) {
      const collection = await collectionRepository.getById(input.siteId, input.collectionId, context);
      await validate(writer, input.siteId, input.values, collectRepositoryCollectionRecordMediaReferences(input.values, collection?.fields));
      const result = await collectionRepository.createRecord(input, context);
      await syncRepositoryCollectionRecordMediaReferences({ mediaRepository: writer.media, siteId: result.item.siteId, collectionId: result.item.collectionId, recordId: result.item.id, values: result.item.values, fields: collection?.fields });
      return result;
    },
    async updateRecord(siteId, collectionId, recordId, input, context) {
      const existing = await collectionRepository.getRecordById(siteId, collectionId, recordId, context);
      const collection = await collectionRepository.getById(siteId, collectionId, context);
      const values = input.values === undefined ? existing?.values : input.values;
      await validate(writer, siteId, values, collectRepositoryCollectionRecordMediaReferences(values, collection?.fields));
      const result = await collectionRepository.updateRecord(siteId, collectionId, recordId, input, context);
      await syncRepositoryCollectionRecordMediaReferences({ mediaRepository: writer.media, siteId: result.item.siteId, collectionId: result.item.collectionId, recordId: result.item.id, values: result.item.values, fields: collection?.fields });
      return result;
    },
    async deleteRecord(siteId, collectionId, recordId, context) {
      const deleted = await collectionRepository.deleteRecord(siteId, collectionId, recordId, context);
      if (deleted) await removeRepositoryCollectionRecordMediaReferences({ mediaRepository: writer.media, siteId, collectionId, recordId });
      return deleted;
    },
  });
  return {
    ...repositories,
    pages: {
      ...repositories.pages,
      create: (input, context) => mutate(input.siteId, async writer => {
        await validate(writer, input.siteId, { content: input.content, meta: input.meta });
        const result = await writer.pages.create(input, context); await pageSync(writer, result.item); return result;
      }),
      update: (siteId, pageId, input, context) => mutate(siteId, async writer => {
        const existing = await writer.pages.getById(siteId, pageId, context);
        const withdrawalOnly = (input.status === 'draft' || input.status === 'archived') && input.content === undefined && input.meta === undefined;
        if (!withdrawalOnly) await validate(writer, siteId, { content: input.content === undefined ? existing?.content : input.content, meta: input.meta === undefined ? existing?.meta : input.meta });
        const result = await writer.pages.update(siteId, pageId, input, context); await pageSync(writer, result.item); return result;
      }),
      publish: (siteId, pageId, context) => mutate(siteId, async writer => {
        const existing = await writer.pages.getById(siteId, pageId, context);
        await validate(writer, siteId, { content: existing?.content, meta: existing?.meta });
        const result = await writer.pages.publish(siteId, pageId, context); await pageSync(writer, result.item); return result;
      }),
      // Withdrawing or deleting legacy content must remain possible even if its old asset is missing.
      archive: (siteId, pageId, context) => mutate(siteId, async writer => {
        const result = await writer.pages.archive(siteId, pageId, context); await pageSync(writer, result.item); return result;
      }),
      delete: (siteId, pageId, context) => mutate(siteId, async writer => {
        const deleted = await writer.pages.delete(siteId, pageId, context);
        if (deleted) await removeRepositoryPageMediaReferences({ mediaRepository: writer.media, siteId, pageId }); return deleted;
      }),
    },
    posts: {
      ...repositories.posts,
      create: (input, context) => mutate(input.siteId, async writer => {
        await validate(writer, input.siteId, { content: input.content, meta: input.meta, mediaId: input.featuredImageId });
        const result = await writer.posts.create(input, context); await postSync(writer, result.item); return result;
      }),
      update: (siteId, postId, input, context) => mutate(siteId, async writer => {
        const existing = await writer.posts.getById(siteId, postId, context);
        const withdrawalOnly = (input.status === 'draft' || input.status === 'archived') && input.content === undefined && input.meta === undefined && input.featuredImageId === undefined;
        if (!withdrawalOnly) await validate(writer, siteId, { content: input.content === undefined ? existing?.content : input.content, meta: input.meta === undefined ? existing?.meta : input.meta, mediaId: input.featuredImageId === undefined ? existing?.featuredImageId : input.featuredImageId });
        const result = await writer.posts.update(siteId, postId, input, context); await postSync(writer, result.item); return result;
      }),
      publish: (siteId, postId, context) => mutate(siteId, async writer => {
        const existing = await writer.posts.getById(siteId, postId, context);
        await validate(writer, siteId, { content: existing?.content, meta: existing?.meta, mediaId: existing?.featuredImageId });
        const result = await writer.posts.publish(siteId, postId, context); await postSync(writer, result.item); return result;
      }),
      archive: (siteId, postId, context) => mutate(siteId, async writer => {
        const result = await writer.posts.archive(siteId, postId, context); await postSync(writer, result.item); return result;
      }),
      delete: (siteId, postId, context) => mutate(siteId, async writer => {
        const deleted = await writer.posts.delete(siteId, postId, context);
        if (deleted) await removeRepositoryPostMediaReferences({ mediaRepository: writer.media, siteId, postId }); return deleted;
      }),
    },
    templateRevisions: repositories.templateRevisions?.withCompositionImportLock ? {
      ...repositories.templateRevisions,
      withCompositionImportLock: (siteId, operation) => {
        assertAdmittedSite(siteId);
        return repositories.templateRevisions.withCompositionImportLock!(siteId,
          scoped => operation(withRepositoryMediaReferenceSync(scoped, siteId)));
      },
    } : repositories.templateRevisions,
    reusableSections: repositories.reusableSections?.applyPropagation ? {
      ...repositories.reusableSections,
      applyPropagation: (siteId, input, context) => {
        assertAdmittedSite(siteId);
        return repositories.reusableSections.applyPropagation(siteId, input, context,
          scoped => withRepositoryMediaReferenceSync(scoped, siteId));
      },
    } : repositories.reusableSections,
    collections: {
      ...repositories.collections,
      applyImport: (siteId, operations) => {
        assertAdmittedSite(siteId);
        return repositories.collections.applyImport(siteId, operations,
          (scoped, writer) => recordWriter(writer, scoped),
          async (writer, collection, retainedRecords) => {
            // Use final values/schema after all imported rows have been saved.
            // Reconcile sequentially so records sharing an asset retain every
            // binding. Do not resave untouched author content or timestamps.
            for (const record of retainedRecords) {
              await validate(writer, siteId, record.values, collectRepositoryCollectionRecordMediaReferences(record.values, collection.fields));
              await syncRepositoryCollectionRecordMediaReferences({ mediaRepository: writer.media, siteId, collectionId: collection.id, recordId: record.id, values: record.values, fields: collection.fields });
            }
          });
      },
      createRecord: (input, context) => mutate(input.siteId, writer => recordWriter(writer).createRecord(input, context)),
      updateRecord: (siteId, collectionId, recordId, input, context) => mutate(siteId, writer => recordWriter(writer).updateRecord(siteId, collectionId, recordId, input, context)),
      deleteRecord: (siteId, collectionId, recordId, context) => mutate(siteId, writer => recordWriter(writer).deleteRecord(siteId, collectionId, recordId, context)),
      // HTTP record admission writes through this callback, so decorate its scoped writer too.
      withRecordWriteLock: (siteId, collectionId, operation) => mutate(siteId, writer => writer.collections.withRecordWriteLock(siteId, collectionId,
        (scoped, collection, context) => operation(recordWriter(writer, scoped), collection, context))),
    },
  };
};

const importDatabaseAdapters = async (): Promise<DatabaseAdapterModule> => (
  import('@backy/db/adapters') as Promise<DatabaseAdapterModule>
);

const importDatabaseRepositories = async (): Promise<DatabaseRepositoryModule> => (
  import('@backy/db/repositories') as Promise<DatabaseRepositoryModule>
);

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

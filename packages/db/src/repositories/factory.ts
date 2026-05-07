import type { BackyRepositories } from '@backy-cms/core/repositories';
import type { DatabaseAdapter } from '../adapters';
import {
    createPageRepository,
    createPostRepository,
    createSiteRepository,
} from './site-page-post';

type ImplementedBackyRepositories = Pick<BackyRepositories, 'sites' | 'pages' | 'posts'>;

export interface DatabaseRepositoryFactoryInput {
    adapter: DatabaseAdapter;
}

export function createDatabaseRepositories(
    input: DatabaseRepositoryFactoryInput,
): ImplementedBackyRepositories {
    return {
        sites: createSiteRepository(input.adapter.db),
        pages: createPageRepository(input.adapter.db),
        posts: createPostRepository(input.adapter.db),
    };
}

export function createUnimplementedRepositoryProxy(repositoryName: string): never {
    throw new Error(
        `${repositoryName} repository is not implemented for this runtime yet. ` +
        'Use the explicit demo adapter while the repository migration is in progress, or add the database repository implementation first.',
    );
}

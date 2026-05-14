import type { BackyRepositories } from '@backy-cms/core/repositories';
import type { DatabaseAdapter } from '../adapters';
import { createAuditLogRepository } from './audit-logs';
import { createBlogTaxonomyRepository } from './blog-taxonomy';
import { createCacheInvalidationRepository } from './cache-invalidations';
import { createCollectionRepository } from './collections';
import { createCommentRepository } from './comments';
import { createContentWorkflowRepository } from './content-workflows';
import { createFormRepository } from './forms';
import { createMediaRepository } from './media';
import { createReusableSectionRepository } from './reusable-sections';
import { createSettingsRepository } from './settings';
import { createTeamRepository } from './teams';
import { createUserRepository } from './users';
import {
    createPageRepository,
    createPostRepository,
    createSiteRepository,
} from './site-page-post';

type ImplementedBackyRepositories = Pick<BackyRepositories, 'teams' | 'sites' | 'pages' | 'posts' | 'blogTaxonomy' | 'media' | 'collections' | 'forms' | 'comments' | 'reusableSections' | 'contentWorkflows' | 'users' | 'settings' | 'auditLogs' | 'cacheInvalidations'>;

export interface DatabaseRepositoryFactoryInput {
    adapter: DatabaseAdapter;
}

export function createDatabaseRepositories(
    input: DatabaseRepositoryFactoryInput,
): ImplementedBackyRepositories {
    return {
        teams: createTeamRepository(input.adapter.db),
        sites: createSiteRepository(input.adapter.db),
        pages: createPageRepository(input.adapter.db),
        posts: createPostRepository(input.adapter.db),
        blogTaxonomy: createBlogTaxonomyRepository(input.adapter.db),
        media: createMediaRepository(input.adapter.db),
        collections: createCollectionRepository(input.adapter.db),
        forms: createFormRepository(input.adapter.db),
        comments: createCommentRepository(input.adapter.db),
        reusableSections: createReusableSectionRepository(input.adapter.db),
        contentWorkflows: createContentWorkflowRepository(input.adapter.db),
        users: createUserRepository(input.adapter.db),
        settings: createSettingsRepository(input.adapter.db),
        auditLogs: createAuditLogRepository(input.adapter.db),
        cacheInvalidations: createCacheInvalidationRepository(input.adapter.db),
    };
}

export function createUnimplementedRepositoryProxy(repositoryName: string): never {
    throw new Error(
        `${repositoryName} repository is not implemented for this runtime yet. ` +
        'Use the explicit demo adapter while the repository migration is in progress, or add the database repository implementation first.',
    );
}

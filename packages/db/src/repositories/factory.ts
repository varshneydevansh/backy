import { createMailboxManagementRepository } from './site-mailbox-management';
import { createCommerceEntitlementRepository } from './commerce-entitlements';
import { createMediaUploadSessionRepository } from './media-upload-sessions';
import { createNewsletterCampaignRepository } from './newsletter-campaigns';
import { createMailboxSendRepository } from './site-mailbox';
import { createFormDeliveryRepository } from './form-deliveries';
import { createCommentDeliveryRepository } from './comment-deliveries';
import { createVisitorAccountRepository } from './visitor-accounts';
import { createSiteDuplicationRepository } from './site-duplication';
import { createSiteBackupRepository } from './site-backups';
import { createTemplateRevisionRepository } from './template-revisions';
import type { BackyRepositories } from '@backy-cms/core/repositories';
import type { DatabaseAdapter } from '../adapters';
import { createAuditLogRepository } from './audit-logs';
import { createBlogTaxonomyRepository } from './blog-taxonomy';
import { createCacheInvalidationRepository } from './cache-invalidations';
import { createCollectionRepository } from './collections';
import { createCommentRepository } from './comments';
import { createContentWorkflowRepository } from './content-workflows';
import { createFormRepository } from './forms';
import { createInteractiveComponentRepository } from './interactive-components';
import { createMediaRepository } from './media';
import { withSiteMediaMutationTransaction } from './media-mutation-admission';
import { createReusableSectionRepository } from './reusable-sections';
import { createSettingsRepository } from './settings';
import { createTeamRepository } from './teams';
import { createUserRepository } from './users';
import {
    createPageRepository,
    createPostRepository,
    createSiteRepository,
} from './site-page-post';

export interface DatabaseRepositoryFactoryInput {
    adapter: DatabaseAdapter;
}

export function createDatabaseRepositories(
    input: DatabaseRepositoryFactoryInput,
): BackyRepositories {
    const repositories = {
        commerceEntitlements: createCommerceEntitlementRepository(input.adapter.db,input.adapter.type),
        mediaUploadSessions: createMediaUploadSessionRepository(input.adapter.db, input.adapter.type),
        async withMediaReferenceMutation<T>(siteId: string, operation: (repositories: BackyRepositories) => Promise<T>): Promise<T> {
            return withSiteMediaMutationTransaction(input.adapter.db, input.adapter.type, siteId, async transaction => operation(createDatabaseRepositories({ adapter: {
                type: input.adapter.type, db: transaction, isConnected: async () => true, close: async () => {},
            } })));
        },
        mailboxManagement: createMailboxManagementRepository(input.adapter.db, input.adapter.type),
        mailboxSends: createMailboxSendRepository(input.adapter.db, input.adapter.type),
        newsletterCampaigns: createNewsletterCampaignRepository(input.adapter.db,input.adapter.type),
        formDeliveries: createFormDeliveryRepository(input.adapter.db,input.adapter.type),
        commentDeliveries: createCommentDeliveryRepository(input.adapter.db,input.adapter.type),
        siteBackups: createSiteBackupRepository(input.adapter.db,input.adapter.type),
        siteDuplication: createSiteDuplicationRepository(input.adapter.db,input.adapter.type),
        visitorAccounts: createVisitorAccountRepository(input.adapter.db),
        teams: createTeamRepository(input.adapter.db),
        sites: createSiteRepository(input.adapter.db,input.adapter.type),
        pages: createPageRepository(input.adapter.db, input.adapter.type),
        posts: createPostRepository(input.adapter.db, input.adapter.type),
        blogTaxonomy: createBlogTaxonomyRepository(input.adapter.db),
        media: createMediaRepository(input.adapter.db, input.adapter.type),
        collections: createCollectionRepository(input.adapter.db,{adapterType:input.adapter.type}),
        forms: createFormRepository(input.adapter.db, input.adapter.type),
        comments: createCommentRepository(input.adapter.db, input.adapter.type),
        reusableSections: createReusableSectionRepository(input.adapter.db, input.adapter.type),
        interactiveComponents: createInteractiveComponentRepository(input.adapter.db),
        contentWorkflows: createContentWorkflowRepository(input.adapter.db),
        templateRevisions: createTemplateRevisionRepository(input.adapter.db, input.adapter.type),
        users: createUserRepository(input.adapter.db, input.adapter.type),
        settings: createSettingsRepository(input.adapter.db),
        auditLogs: createAuditLogRepository(input.adapter.db),
        cacheInvalidations: createCacheInvalidationRepository(input.adapter.db),
    } satisfies BackyRepositories;

    return repositories;
}

export function createUnimplementedRepositoryProxy(repositoryName: string): never {
    throw new Error(
        `${repositoryName} repository is not implemented for this runtime yet. ` +
        'Use the explicit demo adapter while the repository migration is in progress, or add the database repository implementation first.',
    );
}

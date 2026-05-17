import {
    type BackyInteractiveComponent,
    type BackyInteractiveComponentCreateInput,
    type BackyInteractiveComponentFallback,
    type BackyInteractiveComponentIntegrity,
    type BackyInteractiveComponentListInput,
    type BackyInteractiveComponentRepository,
    type BackyInteractiveComponentRenderMode,
    type BackyInteractiveComponentReviewStatus,
    type BackyInteractiveComponentRollbackResult,
    type BackyInteractiveComponentRuntime,
    type BackyInteractiveComponentSource,
    type BackyInteractiveComponentStatus,
    type BackyInteractiveComponentType,
    type BackyInteractiveComponentUpdateInput,
    type BackyJsonObject,
    type BackyListResult,
    type BackyRepositoryMutationResult,
} from '@backy-cms/core';
import { and, desc, eq } from 'drizzle-orm';
import { interactiveComponents } from '../schema';
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
    delete: (table: unknown) => {
        where: (condition: unknown) => Promise<unknown>;
    };
};

type QueryBuilder = {
    where: (condition: unknown) => QueryBuilder;
    orderBy: (...columns: unknown[]) => QueryBuilder;
    limit: (limit: number) => QueryBuilder;
    offset: (offset: number) => QueryBuilder;
    then: Promise<unknown[]>['then'];
};

type ReturningQuery = {
    returning: () => Promise<unknown[]>;
};

type InteractiveComponentRow = typeof interactiveComponents.$inferSelect;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DATA_SCOPES = ['collections', 'media', 'forms', 'commerce', 'page', 'blog'];

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

const normalizeLimit = (limit?: number): number => (
    Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit || DEFAULT_LIMIT)))
);

const normalizeOffset = (offset?: number): number => (
    Math.max(0, Math.floor(offset || 0))
);

const paginate = <TItem>(items: TItem[], limit?: number, offset?: number): BackyListResult<TItem> => {
    const normalizedLimit = normalizeLimit(limit);
    const normalizedOffset = normalizeOffset(offset);
    const pagedItems = items.slice(normalizedOffset, normalizedOffset + normalizedLimit);

    return {
        items: pagedItems,
        pagination: {
            total: items.length,
            limit: normalizedLimit,
            offset: normalizedOffset,
            hasMore: normalizedOffset + normalizedLimit < items.length,
        },
    };
};

const firstOrNull = async <TRow>(query: PromiseLike<unknown[]>): Promise<TRow | null> => {
    const rows = await query;
    return (rows[0] || null) as TRow | null;
};

const normalizeStringList = (value: unknown, fallback: string[] = [], allowed?: string[]): string[] => {
    const raw = Array.isArray(value)
        ? value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean)
        : fallback;
    const allowedSet = allowed ? new Set(allowed) : null;
    return Array.from(new Set(raw.filter((item) => !allowedSet || allowedSet.has(item))));
};

const normalizeControls = (value: unknown): BackyJsonObject[] => (
    Array.isArray(value)
        ? value.filter(isRecord).map((entry) => entry as BackyJsonObject)
        : []
);

const normalizeFallback = (value: unknown): BackyInteractiveComponentFallback => {
    const input = isRecord(value) ? value : {};
    return {
        required: input.required === false ? false : true,
        supported: normalizeStringList(input.supported, ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel']),
    };
};

const normalizeIntegrity = (value: unknown): BackyInteractiveComponentIntegrity => {
    const input = isRecord(value) ? value : {};
    return {
        signed: input.signed === true,
        signatureRequiredForCustomCode: input.signatureRequiredForCustomCode === false ? false : true,
        algorithm: typeof input.algorithm === 'string' && input.algorithm.trim() ? input.algorithm.trim() : undefined,
        sha256: typeof input.sha256 === 'string' && input.sha256.trim() ? input.sha256.trim() : undefined,
        signature: typeof input.signature === 'string' && input.signature.trim() ? input.signature.trim() : undefined,
        signedBy: typeof input.signedBy === 'string' && input.signedBy.trim() ? input.signedBy.trim() : null,
        signedAt: typeof input.signedAt === 'string' && input.signedAt.trim() ? input.signedAt.trim() : null,
        storageProvider: typeof input.storageProvider === 'string' && input.storageProvider.trim() ? input.storageProvider.trim() : undefined,
        storagePath: typeof input.storagePath === 'string' && input.storagePath.trim() ? input.storagePath.trim() : undefined,
        bundleUrl: typeof input.bundleUrl === 'string' && input.bundleUrl.trim() ? input.bundleUrl.trim() : undefined,
        sizeBytes: Number.isFinite(Number(input.sizeBytes)) ? Math.max(0, Number(input.sizeBytes)) : undefined,
        contentType: typeof input.contentType === 'string' && input.contentType.trim() ? input.contentType.trim() : undefined,
        filename: typeof input.filename === 'string' && input.filename.trim() ? input.filename.trim() : undefined,
    };
};

const normalizeRuntime = (value: unknown): BackyInteractiveComponentRuntime => {
    const input = isRecord(value) ? value : {};
    return {
        sandboxUrl: typeof input.sandboxUrl === 'string' && input.sandboxUrl.trim() ? input.sandboxUrl.trim() : null,
        bundleUrl: typeof input.bundleUrl === 'string' && input.bundleUrl.trim() ? input.bundleUrl.trim() : null,
        iframeSandbox: typeof input.iframeSandbox === 'string' && input.iframeSandbox.trim() ? input.iframeSandbox.trim() : undefined,
        allowedPermissions: normalizeStringList(input.allowedPermissions),
        postMessageProtocol: typeof input.postMessageProtocol === 'string' && input.postMessageProtocol.trim()
            ? input.postMessageProtocol.trim()
            : 'backy.interactive-component.v1',
    };
};

const normalizeSecurity = (value: unknown): BackyJsonObject => ({
    ...(isRecord(value) ? value : {}),
    adminApiAccess: false,
    parentDomAccess: false,
    parentCookieAccess: false,
    secretsInPayload: false,
    communication: 'postMessage-only',
});

const normalizeType = (value: unknown): BackyInteractiveComponentType => (
    value === 'interactiveFigure' ? 'interactiveFigure' : 'codeComponent'
);

const normalizeStatus = (value: unknown): BackyInteractiveComponentStatus => (
    value === 'active' || value === 'archived' ? value : 'disabled'
);

const normalizeReviewStatus = (value: unknown): BackyInteractiveComponentReviewStatus => {
    if (value === 'in_review' || value === 'approved' || value === 'rejected') return value;
    return 'draft';
};

const normalizeRenderMode = (value: unknown): BackyInteractiveComponentRenderMode => {
    if (value === 'trusted-component' || value === 'static-fallback') return value;
    return 'sandbox-iframe';
};

const normalizeSource = (value: unknown): BackyInteractiveComponentSource => (
    value === 'registry' ? 'registry' : 'custom'
);

const normalizeMetadata = (value: unknown): BackyJsonObject => (
    isRecord(value) ? value as BackyJsonObject : {}
);

const searchText = (component: BackyInteractiveComponent, search: string): boolean => (
    [
        component.componentKey,
        component.displayName,
        component.description,
        component.version,
        ...component.allowedDataScopes,
    ].join(' ').toLowerCase().includes(search.toLowerCase())
);

const toInteractiveComponent = (row: InteractiveComponentRow): BackyInteractiveComponent => ({
    id: row.id,
    siteId: row.siteId,
    componentKey: row.componentKey,
    displayName: row.displayName,
    type: normalizeType(row.type),
    status: normalizeStatus(row.status),
    reviewStatus: normalizeReviewStatus(row.reviewStatus),
    version: row.version,
    renderMode: normalizeRenderMode(row.renderMode),
    source: normalizeSource(row.source),
    description: row.description || '',
    allowedDataScopes: normalizeStringList(row.allowedDataScopes, DATA_SCOPES, DATA_SCOPES),
    requiredFields: normalizeStringList(row.requiredFields, ['componentKey', 'version', 'fallback']),
    controls: normalizeControls(row.controls),
    fallback: normalizeFallback(row.fallback),
    security: normalizeSecurity(row.security),
    integrity: normalizeIntegrity(row.integrity),
    runtime: normalizeRuntime(row.runtime),
    ownerId: row.ownerId,
    dependencyMetadata: normalizeMetadata(row.dependencyMetadata),
    changelog: row.changelog,
    rollbackFromVersion: row.rollbackFromVersion,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt ? toIso(row.reviewedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
});

export function createInteractiveComponentRepository(db: DatabaseInstance): BackyInteractiveComponentRepository {
    const database = asDb(db);

    return {
        async list(input: BackyInteractiveComponentListInput): Promise<BackyListResult<BackyInteractiveComponent>> {
            const rows = await database.select().from(interactiveComponents).where(eq(interactiveComponents.siteId, input.siteId)).orderBy(desc(interactiveComponents.updatedAt)) as InteractiveComponentRow[];
            const filtered = rows
                .map(toInteractiveComponent)
                .filter((component) => input.publicOnly ? component.reviewStatus === 'approved' && component.status === 'active' : true)
                .filter((component) => input.status && input.status !== 'all' ? component.status === input.status : true)
                .filter((component) => input.reviewStatus && input.reviewStatus !== 'all' ? component.reviewStatus === input.reviewStatus : true)
                .filter((component) => input.type && input.type !== 'all' ? component.type === input.type : true)
                .filter((component) => input.search ? searchText(component, input.search) : true);
            return paginate(filtered, input.limit, input.offset);
        },

        async getById(siteId: string, componentId: string): Promise<BackyInteractiveComponent | null> {
            const row = await firstOrNull<InteractiveComponentRow>(
                database.select().from(interactiveComponents).where(and(eq(interactiveComponents.siteId, siteId), eq(interactiveComponents.id, componentId))).limit(1),
            );
            return row ? toInteractiveComponent(row) : null;
        },

        async getByKeyVersion(siteId: string, componentKey: string, version: string): Promise<BackyInteractiveComponent | null> {
            const row = await firstOrNull<InteractiveComponentRow>(
                database.select().from(interactiveComponents).where(and(
                    eq(interactiveComponents.siteId, siteId),
                    eq(interactiveComponents.componentKey, componentKey),
                    eq(interactiveComponents.version, version),
                )).limit(1),
            );
            return row ? toInteractiveComponent(row) : null;
        },

        async create(input: BackyInteractiveComponentCreateInput): Promise<BackyRepositoryMutationResult<BackyInteractiveComponent>> {
            const [row] = await database.insert(interactiveComponents).values({
                siteId: input.siteId,
                componentKey: input.componentKey,
                displayName: input.displayName,
                type: input.type,
                status: input.status || 'disabled',
                reviewStatus: input.reviewStatus || 'draft',
                version: input.version,
                renderMode: input.renderMode,
                source: input.source || 'custom',
                description: input.description || '',
                allowedDataScopes: input.allowedDataScopes || DATA_SCOPES,
                requiredFields: input.requiredFields || ['componentKey', 'version', 'fallback'],
                controls: input.controls || [],
                fallback: input.fallback || { required: true, supported: ['title', 'text', 'html', 'imageUrl', 'alt', 'ariaLabel'] },
                security: normalizeSecurity(input.security),
                integrity: input.integrity || { signed: false, signatureRequiredForCustomCode: true },
                runtime: input.runtime || { postMessageProtocol: 'backy.interactive-component.v1' },
                ownerId: input.ownerId || null,
                dependencyMetadata: input.dependencyMetadata || {},
                changelog: input.changelog || null,
                rollbackFromVersion: input.rollbackFromVersion || null,
                createdBy: input.createdBy || null,
                updatedBy: input.updatedBy || input.createdBy || null,
                reviewedBy: input.reviewedBy || null,
                reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
                updatedAt: new Date(),
            }).returning() as InteractiveComponentRow[];
            return { item: toInteractiveComponent(row) };
        },

        async update(siteId: string, componentKey: string, version: string, input: BackyInteractiveComponentUpdateInput): Promise<BackyRepositoryMutationResult<BackyInteractiveComponent>> {
            const updates: Record<string, unknown> = { updatedAt: new Date() };
            if (input.displayName !== undefined) updates.displayName = input.displayName;
            if (input.type !== undefined) updates.type = input.type;
            if (input.status !== undefined) updates.status = input.status;
            if (input.reviewStatus !== undefined) updates.reviewStatus = input.reviewStatus;
            if (input.renderMode !== undefined) updates.renderMode = input.renderMode;
            if (input.source !== undefined) updates.source = input.source;
            if (input.description !== undefined) updates.description = input.description;
            if (input.allowedDataScopes !== undefined) updates.allowedDataScopes = input.allowedDataScopes;
            if (input.requiredFields !== undefined) updates.requiredFields = input.requiredFields;
            if (input.controls !== undefined) updates.controls = input.controls;
            if (input.fallback !== undefined) updates.fallback = input.fallback;
            if (input.security !== undefined) updates.security = normalizeSecurity(input.security);
            if (input.integrity !== undefined) updates.integrity = input.integrity;
            if (input.runtime !== undefined) updates.runtime = input.runtime;
            if (input.ownerId !== undefined) updates.ownerId = input.ownerId;
            if (input.dependencyMetadata !== undefined) updates.dependencyMetadata = input.dependencyMetadata;
            if (input.changelog !== undefined) updates.changelog = input.changelog;
            if (input.rollbackFromVersion !== undefined) updates.rollbackFromVersion = input.rollbackFromVersion;
            if (input.updatedBy !== undefined) updates.updatedBy = input.updatedBy;
            if (input.reviewedBy !== undefined) updates.reviewedBy = input.reviewedBy;
            if (input.reviewedAt !== undefined) updates.reviewedAt = input.reviewedAt ? new Date(input.reviewedAt) : null;

            const [row] = await database.update(interactiveComponents).set(updates).where(and(
                eq(interactiveComponents.siteId, siteId),
                eq(interactiveComponents.componentKey, componentKey),
                eq(interactiveComponents.version, version),
            )).returning() as InteractiveComponentRow[];
            return { item: toInteractiveComponent(row) };
        },

        async rollbackVersion(siteId: string, componentKey: string, version: string, input = {}): Promise<BackyInteractiveComponentRollbackResult | null> {
            const target = await this.getByKeyVersion(siteId, componentKey, version);
            if (!target) {
                return null;
            }
            const activeVersions = (await this.list({ siteId, status: 'active', reviewStatus: 'all', type: 'all', limit: 100 })).items
                .filter((component) => component.componentKey === componentKey && component.version !== version);
            const actor = input.rollbackBy || input.updatedBy || 'admin';
            const activeBeforeRollback = activeVersions[0] || null;
            const disabledVersions: BackyInteractiveComponent[] = [];

            for (const component of activeVersions) {
                const disabled = (await this.update(siteId, componentKey, component.version, {
                    status: 'disabled',
                    updatedBy: actor,
                })).item;
                disabledVersions.push(disabled);
            }

            const restored = (await this.update(siteId, componentKey, version, {
                status: 'active',
                reviewStatus: 'approved',
                rollbackFromVersion: activeBeforeRollback?.version || target.rollbackFromVersion || null,
                changelog: input.changelog || target.changelog,
                updatedBy: actor,
                reviewedBy: actor,
                reviewedAt: new Date().toISOString(),
            })).item;

            return {
                restored,
                disabledVersions,
                restoredFromVersion: restored.rollbackFromVersion || null,
            };
        },

        async delete(siteId: string, componentKey: string, version: string): Promise<boolean> {
            const existing = await this.getByKeyVersion(siteId, componentKey, version);
            if (!existing) {
                return false;
            }

            await database.delete(interactiveComponents).where(and(
                eq(interactiveComponents.siteId, siteId),
                eq(interactiveComponents.componentKey, componentKey),
                eq(interactiveComponents.version, version),
            ));
            return true;
        },
    };
}

/**
 * BACKY CMS - EDIT BLOG POST (HYBRID LAYOUT)
 */

import { useCallback, useEffect, useState, useMemo, type Dispatch, type SetStateAction } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { AlertTriangle, Archive, ArrowLeft, CalendarClock, CheckCircle2, Code2, Copy, Download, ExternalLink, Eye, Flag, Globe, History, Image as ImageIcon, Maximize2, MessageSquare, Minimize2, PenLine, RefreshCw, RotateCcw, Save, SearchCheck, Send, Tags, Trash2, UserRound, X, XCircle } from 'lucide-react';
import {
    AdminContentApiError,
    archiveBlogPost,
    buildNewsletterIssueDraft,
    createBlogPostPreview,
    deleteBlogPost,
    getAdminApiBase,
    getBlogPost,
    getBlogPostReadiness,
    getUserPermissions,
    listAllComments,
    listBlogAuthors,
    listBlogCategories,
    listBlogPosts,
    listBlogPostRevisions,
    listBlogTags,
    publishBlogPost,
    rollbackBlogPost,
    updateBlogPost,
    updateComments,
    type AdminComment,
    type AdminUserPermissionMatrix,
    type BlogAuthor,
    type BlogCategory,
    type BlogPostReadiness,
    type BlogTag,
    type CommentModerationStatus,
    type ContentRevision,
    type NewsletterIssueDraftHandoff,
} from '@/lib/adminContentApi';
import { adminPermissionReason, isAdminPermissionAllowed } from '@/lib/adminPermissionUi';
import { fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/dateTime';
import { useStore, type BlogPost, type ContentStatus } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { CanvasEditor, collectInteractiveReadinessIssues } from '@/components/editor/CanvasEditor';
import { EditorWorkspaceFrame } from '@/components/editor/EditorWorkspaceFrame';
import { MediaLibraryModal } from '@/components/editor/MediaLibraryModal';
import {
    RevisionCanvasVisualDiff,
    getRevisionCanvasPixelComparison,
    type RevisionCanvasPixelComparison,
} from '@/components/editor/RevisionCanvasVisualDiff';
import { useAuthStore, type User } from '@/stores/authStore';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Panel, PanelContent, PanelHeader } from '@/components/ui/Panel';
import { getSiteSelectionFromSearch, siteMatchesIdentifier } from '@/lib/siteSelection';
import { getPublicMediaFileUrl } from '@/lib/mediaApi';
import type { CanvasElement } from '@/types/editor';
import type { CanvasSize } from '@/types/editor';
import type { PageSettings } from '@/components/editor/PageSettingsModal';
import { compareCanvasRevisionElements, type CanvasRevisionElementDiff } from '@/lib/revisionCanvasDiff';
import {
    getContentRevisionActionLabel,
    getContentRevisionActorLabel,
    getContentRevisionGraphNodeLabel,
    getContentRevisionSnapshotUpdatedLabel,
} from '@/lib/revisionMetadata';
import {
  createCanvasElement,
  normalizeSavedCanvasContent,
  serializeCanvasContent,
} from '@/components/editor/editorCatalog';
import { canvasElementsToBackyContentDocument } from '@backy-cms/core';

interface BlogEditorSearch {
    siteId?: string;
    focus?: 'canvas';
    elementId?: string;
}

const normalizedSearchString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
};

export const Route = createFileRoute('/blog/$postId')({
    validateSearch: (search: Record<string, unknown>): BlogEditorSearch => ({
        siteId: normalizedSearchString(search.siteId),
        focus: search.focus === 'canvas' ? 'canvas' : undefined,
        elementId: normalizedSearchString(search.elementId),
    }),
    component: EditBlogPostPage,
});

const BLOG_EDITOR_CONTROL_AREAS = [
    {
        title: 'Editorial draft',
        detail: 'Control title, slug, excerpt, list copy, and SEO summary.',
        href: '#blog-editor-draft',
    },
    {
        title: 'Design canvas',
        detail: 'Drag, group, layer, bind, focus, and compose the public article page.',
        href: '#blog-editor-canvas',
    },
    {
        title: 'Publish controls',
        detail: 'Preview, save, publish, schedule, archive, discard, and delete.',
        href: '#blog-editor-publish',
    },
    {
        title: 'SEO',
        detail: 'Canonical path, search title, description, Open Graph image, and robots flags.',
        href: '#blog-editor-seo',
    },
    {
        title: 'Featured media',
        detail: 'Choose the post image used by listings, social previews, feeds, and custom frontend cards.',
        href: '#blog-editor-media',
    },
    {
        title: 'Taxonomy',
        detail: 'Assign author, categories, and tags for lists, feeds, and frontend filters.',
        href: '#blog-editor-taxonomy',
    },
    {
        title: 'Comments',
        detail: 'Review pending, approved, reported, spam, and blocked public discussion state.',
        href: '#blog-editor-comments',
    },
    {
        title: 'Newsletter',
        detail: 'Prepare this report as a provider-safe newsletter issue source.',
        href: '#blog-editor-newsletter',
    },
    {
        title: 'Revisions',
        detail: 'Restore saved post snapshots when the article design needs rollback.',
        href: '#blog-editor-revisions',
    },
    {
        title: 'Frontend handoff',
        detail: 'Copy admin/public endpoints, canvas contract, taxonomy, and readiness data.',
        href: '#blog-editor-handoff',
    },
] as const;

const BLOG_EDITOR_STATUS_OPTIONS: ContentStatus[] = ['draft', 'published', 'scheduled', 'archived'];

type BlogEditorPermissionKey =
    | 'pages.view'
    | 'pages.edit'
    | 'pages.publish'
    | 'pages.delete'
    | 'media.view'
    | 'media.create'
    | 'collections.view'
    | 'comments.view'
    | 'comments.manage'
    | 'forms.export';

const BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS: Record<BlogEditorPermissionKey, Array<User['role']>> = {
    'pages.view': ['owner', 'admin', 'editor', 'viewer'],
    'pages.edit': ['owner', 'admin', 'editor'],
    'pages.publish': ['owner', 'admin', 'editor'],
    'pages.delete': ['owner', 'admin'],
    'media.view': ['owner', 'admin', 'editor', 'viewer'],
    'media.create': ['owner', 'admin', 'editor'],
    'collections.view': ['owner', 'admin', 'editor', 'viewer'],
    'comments.view': ['owner', 'admin', 'editor', 'viewer'],
    'comments.manage': ['owner', 'admin', 'editor'],
    'forms.export': ['owner', 'admin'],
};

const getMetaString = (meta: Record<string, any> | undefined, key: string): string => {
    const value = meta?.[key];
    return typeof value === 'string' ? value : '';
};

const getMetaBoolean = (meta: Record<string, any> | undefined, key: string): boolean => {
    const value = meta?.[key];
    return typeof value === 'boolean' ? value : false;
};

const getScheduledBlogEditorDateError = (status: ContentStatus, scheduledAt: string | null): string | null => {
    if (status !== 'scheduled') return null;
    if (!scheduledAt) return 'Choose a publish date before scheduling changes.';

    const scheduledAtMs = Date.parse(scheduledAt);
    if (!Number.isFinite(scheduledAtMs) || scheduledAtMs <= Date.now()) {
        return 'Choose a future publish date before scheduling changes.';
    }

    return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const getMetaRecord = (meta: Record<string, any> | undefined, key: string): Record<string, unknown> | null => {
    const value = meta?.[key];
    return isRecord(value) ? value : null;
};

const getMetaArray = (meta: Record<string, any> | undefined, key: string): unknown[] => {
    const value = meta?.[key];
    return Array.isArray(value) ? value : [];
};

const recordKeyCount = (value: unknown): number => (
    isRecord(value) ? Object.keys(value).length : 0
);

const arrayCount = (value: unknown): number => (
    Array.isArray(value) ? value.length : 0
);

type BlogCanvasTreeStats = {
    rootLayerCount: number;
    totalLayerCount: number;
    containerLayerCount: number;
    maxDepth: number;
};

type BlogRevisionDiff = {
    id: string;
    changedFields: string[];
    details: BlogRevisionDiffDetail[];
    summary: string;
    currentLayerCount: number;
    snapshotLayerCount: number;
    layerDelta: number;
    currentRootLayerCount: number;
    snapshotRootLayerCount: number;
    rootLayerDelta: number;
    elementDiff: CanvasRevisionElementDiff;
    renderedPixelDiff: RevisionCanvasPixelComparison;
};

type BlogRevisionDiffDetail = {
    field: string;
    label: string;
    snapshot: string;
    current: string;
};

type BlogRevisionTimelineNode = {
    id: string;
    position: number;
    total: number;
    label: string;
    summary: string;
    createdAt: string;
    createdBy: string | null;
    actor: string;
    action: string;
    status: ContentRevision['snapshotStatus'];
    snapshotUpdatedAt: string | null;
    snapshotUpdatedLabel: string;
    newerId: string | null;
    olderId: string | null;
    isLatest: boolean;
    isOldest: boolean;
    branchId: string;
    branchLabel: string;
    branchLane: number;
    branchRole: BlogRevisionBranchRole;
    chronologicalParentId: string | null;
    chronologicalChildId: string | null;
    restoreTargetId: string | null;
    restoreTargetPosition: number | null;
    restoreTargetLabel: string | null;
    restoreEdgeId: string | null;
    branchMetadata: ContentRevision['branchMetadata'] | null;
};

type BlogRevisionBranchRole = 'trunk' | 'restore-checkpoint' | 'restore-branch';

type BlogRevisionGraphEdge = {
    id: string;
    fromId: string;
    toId: string;
    kind: 'chronological' | 'rollback-target';
    label: string;
    inferred: boolean;
};

type BlogRevisionBranchSummary = {
    id: string;
    label: string;
    lane: number;
    nodeIds: string[];
    branchPointRevisionId: string | null;
    restoreTargetRevisionId: string | null;
    restoreTargetPosition: number | null;
    status: 'active' | 'historical' | 'pending-save';
};

type BlogRevisionBranchGraph = {
    schema: 'backy.blog-revision-branch-graph.v1';
    totalNodes: number;
    branchCount: number;
    rootBranchId: string;
    activeBranchId: string | null;
    branches: BlogRevisionBranchSummary[];
    edges: BlogRevisionGraphEdge[];
    nodes: BlogRevisionTimelineNode[];
    inference: {
        source: 'revision-api-branch-metadata' | 'revision-notes';
        rollbackNotePattern: string;
        confidence: 'explicit-api-metadata' | 'inferred';
        limitation: string;
    };
};

const BLOG_REVISION_COLLAPSED_COUNT = 6;
const BLOG_REVISION_RESTORE_TARGET_PATTERN = /\b(?:rollback|restore)\s+to\s+([a-zA-Z0-9_-]+)/i;

const isBlogRevisionBranchRole = (value: unknown): value is BlogRevisionBranchRole => (
    value === 'trunk' || value === 'restore-checkpoint' || value === 'restore-branch'
);

const getBlogRevisionBranchMetadata = (
    revision: Pick<ContentRevision, 'branchMetadata'>,
): NonNullable<ContentRevision['branchMetadata']> | null => (
    revision.branchMetadata?.schemaVersion === 'backy.content-revision-branch-metadata.v1'
        ? revision.branchMetadata
        : null
);

const getBlogRevisionRestoreTargetId = (revision: Pick<ContentRevision, 'note' | 'branchMetadata'>): string | null => {
    const metadataRestoreTargetId = getBlogRevisionBranchMetadata(revision)?.restoreTargetRevisionId;
    if (metadataRestoreTargetId) return metadataRestoreTargetId;

    const note = revision.note || '';
    const match = note.match(BLOG_REVISION_RESTORE_TARGET_PATTERN);
    return match?.[1] || null;
};

const buildBlogRevisionBranchGraph = (revisions: ContentRevision[]): BlogRevisionBranchGraph => {
    const hasApiBranchMetadata = revisions.some((revision) => (
        revision.branchMetadata?.schemaVersion === 'backy.content-revision-branch-metadata.v1'
    ));
    const revisionIds = new Set(revisions.map((revision) => revision.id));
    const positionById = new Map(revisions.map((revision, index) => [revision.id, index + 1]));
    const branchByRevisionId = new Map<string, string>();
    const branches = new Map<string, Omit<BlogRevisionBranchSummary, 'status'>>();
    const edges: BlogRevisionGraphEdge[] = [];
    const rootBranchId = 'trunk';

    branches.set(rootBranchId, {
        id: rootBranchId,
        label: 'Main timeline',
        lane: 0,
        nodeIds: [],
        branchPointRevisionId: null,
        restoreTargetRevisionId: null,
        restoreTargetPosition: null,
    });

    const chronologicalRevisions = [...revisions].reverse();
    let activeBranchId = rootBranchId;
    let lane = 0;

    chronologicalRevisions.forEach((revision, chronologicalIndex) => {
        const activeBranch = branches.get(activeBranchId) || branches.get(rootBranchId);
        activeBranch?.nodeIds.push(revision.id);
        branchByRevisionId.set(revision.id, activeBranch?.id || rootBranchId);

        const newerRevision = chronologicalRevisions[chronologicalIndex + 1];
        if (newerRevision) {
            edges.push({
                id: `chronological-${revision.id}-${newerRevision.id}`,
                fromId: revision.id,
                toId: newerRevision.id,
                kind: 'chronological',
                label: `Chronological save #${positionById.get(revision.id) || '?'} to #${positionById.get(newerRevision.id) || '?'}`,
                inferred: false,
            });
        }

        const restoreTargetId = getBlogRevisionRestoreTargetId(revision);
        if (restoreTargetId && revisionIds.has(restoreTargetId)) {
            const restoreTargetPosition = positionById.get(restoreTargetId) || null;
            const restoreBranchId = `restore-${revision.id}`;
            edges.push({
                id: `rollback-${revision.id}-${restoreTargetId}`,
                fromId: revision.id,
                toId: restoreTargetId,
                kind: 'rollback-target',
                label: `Rollback checkpoint restores from #${restoreTargetPosition || '?'}`,
                inferred: !hasApiBranchMetadata,
            });

            lane += 1;
            branches.set(restoreBranchId, {
                id: restoreBranchId,
                label: `Restore branch from #${restoreTargetPosition || '?'}`,
                lane,
                nodeIds: [],
                branchPointRevisionId: revision.id,
                restoreTargetRevisionId: restoreTargetId,
                restoreTargetPosition,
            });
            activeBranchId = restoreBranchId;
        }
    });

    const latestRevisionId = revisions[0]?.id || null;
    const latestBranchId = latestRevisionId ? branchByRevisionId.get(latestRevisionId) || rootBranchId : null;
    const branchSummaries: BlogRevisionBranchSummary[] = Array.from(branches.values()).map((branch) => ({
        ...branch,
        status: branch.nodeIds.length === 0
            ? 'pending-save'
            : branch.id === latestBranchId
                ? 'active'
                : 'historical',
    }));
    const branchSummaryById = new Map(branchSummaries.map((branch) => [branch.id, branch]));
    const rollbackEdgesByFromId = new Map(
        edges
            .filter((edge) => edge.kind === 'rollback-target')
            .map((edge) => [edge.fromId, edge]),
    );
    const nodes = revisions.map((revision, index) => {
        const branchMetadata = getBlogRevisionBranchMetadata(revision);
        const branchId = branchMetadata?.branchId || branchByRevisionId.get(revision.id) || rootBranchId;
        const branch = branchSummaryById.get(branchId) || branchSummaries[0];
        const restoreTargetId = getBlogRevisionRestoreTargetId(revision);
        const restoreTargetPosition = branchMetadata?.restoreTargetPosition ?? (restoreTargetId ? positionById.get(restoreTargetId) || null : null);
        const restoreEdge = rollbackEdgesByFromId.get(revision.id) || null;
        const metadataBranchRole = branchMetadata?.branchRole;
        const branchRole = isBlogRevisionBranchRole(metadataBranchRole)
            ? metadataBranchRole
            : restoreTargetId && revisionIds.has(restoreTargetId)
                ? 'restore-checkpoint'
                : branchId === rootBranchId
                    ? 'trunk'
                    : 'restore-branch';

        return {
            id: revision.id,
            position: index + 1,
            total: revisions.length,
            label: `Revision ${index + 1} of ${revisions.length}`,
            summary: getContentRevisionGraphNodeLabel(revision, index + 1, revisions.length),
            createdAt: revision.createdAt,
            createdBy: revision.createdBy,
            actor: getContentRevisionActorLabel(revision),
            action: getContentRevisionActionLabel(revision),
            status: revision.snapshotStatus,
            snapshotUpdatedAt: revision.snapshotUpdatedAt,
            snapshotUpdatedLabel: getContentRevisionSnapshotUpdatedLabel(revision),
            newerId: revisions[index - 1]?.id || null,
            olderId: revisions[index + 1]?.id || null,
            isLatest: index === 0,
            isOldest: index === revisions.length - 1,
            branchId,
            branchLabel: branchMetadata?.branchLabel || branch?.label || 'Main timeline',
            branchLane: branchMetadata?.branchLane ?? branch?.lane ?? 0,
            branchRole,
            chronologicalParentId: branchMetadata?.chronologicalParentId ?? revisions[index + 1]?.id ?? null,
            chronologicalChildId: branchMetadata?.chronologicalChildId ?? revisions[index - 1]?.id ?? null,
            restoreTargetId: restoreTargetId && revisionIds.has(restoreTargetId) ? restoreTargetId : null,
            restoreTargetPosition,
            restoreTargetLabel: restoreTargetPosition ? `Revision #${restoreTargetPosition}` : null,
            restoreEdgeId: branchMetadata?.restoreEdgeId || restoreEdge?.id || null,
            branchMetadata,
        } satisfies BlogRevisionTimelineNode;
    });

    return {
        schema: 'backy.blog-revision-branch-graph.v1',
        totalNodes: nodes.length,
        branchCount: branchSummaries.length,
        rootBranchId,
        activeBranchId: latestBranchId,
        branches: branchSummaries,
        edges,
        nodes,
        inference: {
            source: hasApiBranchMetadata ? 'revision-api-branch-metadata' : 'revision-notes',
            rollbackNotePattern: BLOG_REVISION_RESTORE_TARGET_PATTERN.source,
            confidence: hasApiBranchMetadata ? 'explicit-api-metadata' : 'inferred',
            limitation: hasApiBranchMetadata
                ? 'Backy revision APIs return normalized branch metadata from persisted parent revision, operation, restore-target, order, and legacy rollback-note metadata.'
                : 'Backy currently stores blog revision order and rollback notes for legacy revisions; new revisions persist parent revision, operation, and restore-target metadata.',
        },
    };
};

const getBlogCanvasTreeStats = (elements: CanvasElement[]): BlogCanvasTreeStats => {
    let totalLayerCount = 0;
    let containerLayerCount = 0;
    let maxDepth = 0;

    const visit = (nodes: CanvasElement[], depth: number) => {
        nodes.forEach((element) => {
            totalLayerCount += 1;
            maxDepth = Math.max(maxDepth, depth);

            if (element.children?.length) {
                containerLayerCount += 1;
                visit(element.children, depth + 1);
            }
        });
    };

    visit(elements, elements.length > 0 ? 1 : 0);

    return {
        rootLayerCount: elements.length,
        totalLayerCount,
        containerLayerCount,
        maxDepth,
    };
};

const sortedIds = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b));

const sameIdSet = (left: string[], right: string[]) => {
    const sortedLeft = sortedIds(left);
    const sortedRight = sortedIds(right);
    return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index]);
};

const compactBlogRevisionDiffValue = (value: string | null | undefined, fallback = 'empty'): string => {
    const normalized = value?.trim();
    if (!normalized) return fallback;
    return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
};

const blogRevisionDiff = (
    revision: ContentRevision,
    input: {
        title: string;
        slug: string;
        status: ContentStatus;
        excerpt: string;
        seoTitle: string;
        seoDescription: string;
        featuredImageId: string | null;
        selectedAuthorId: string;
        selectedCategoryIds: string[];
        selectedTagIds: string[];
        canvasSize: CanvasSize;
        canvasStats: BlogCanvasTreeStats;
        canvasElements: CanvasElement[];
    },
): BlogRevisionDiff => {
    const changedFields: string[] = [];
    const details: BlogRevisionDiffDetail[] = [];
    const elementDiff = compareCanvasRevisionElements(revision.snapshotElements, input.canvasElements);
    const renderedPixelDiff = getRevisionCanvasPixelComparison({
        snapshotElements: revision.snapshotElements,
        currentElements: input.canvasElements,
        snapshotCanvasWidth: revision.snapshotCanvas.canvasWidth,
        snapshotCanvasHeight: revision.snapshotCanvas.canvasHeight,
        currentCanvasWidth: input.canvasSize.width,
        currentCanvasHeight: input.canvasSize.height,
        elementDiff,
    });
    const addChange = (field: string, label: string, snapshot: string, current: string) => {
        changedFields.push(field);
        details.push({
            field,
            label,
            snapshot,
            current,
        });
    };

    if (revision.snapshotTitle !== input.title) {
        addChange('title', 'Title', compactBlogRevisionDiffValue(revision.snapshotTitle), compactBlogRevisionDiffValue(input.title));
    }

    if (revision.snapshotSlug !== input.slug) {
        addChange('route', 'Route', `/blog/${compactBlogRevisionDiffValue(revision.snapshotSlug, 'missing')}`, `/blog/${compactBlogRevisionDiffValue(input.slug, 'missing')}`);
    }

    if (revision.snapshotStatus !== input.status) {
        addChange('status', 'Status', revision.snapshotStatus, input.status);
    }

    if ((revision.snapshotExcerpt || '') !== input.excerpt) {
        addChange('excerpt', 'Excerpt', compactBlogRevisionDiffValue(revision.snapshotExcerpt), compactBlogRevisionDiffValue(input.excerpt));
    }

    if (
        (revision.snapshotMetaTitle || revision.snapshotTitle) !== (input.seoTitle || input.title) ||
        (revision.snapshotMetaDescription || revision.snapshotExcerpt || '') !== (input.seoDescription || input.excerpt)
    ) {
        addChange(
            'SEO',
            'SEO',
            `${compactBlogRevisionDiffValue(revision.snapshotMetaTitle || revision.snapshotTitle)} / ${compactBlogRevisionDiffValue(revision.snapshotMetaDescription || revision.snapshotExcerpt)}`,
            `${compactBlogRevisionDiffValue(input.seoTitle || input.title)} / ${compactBlogRevisionDiffValue(input.seoDescription || input.excerpt)}`,
        );
    }

    if ((revision.snapshotFeaturedImageId || '') !== (input.featuredImageId || '')) {
        addChange('featured media', 'Media', revision.snapshotFeaturedImageId || 'none', input.featuredImageId || 'none');
    }

    if (
        (revision.snapshotAuthorId || '') !== input.selectedAuthorId ||
        !sameIdSet(revision.snapshotCategoryIds, input.selectedCategoryIds) ||
        !sameIdSet(revision.snapshotTagIds, input.selectedTagIds)
    ) {
        addChange(
            'taxonomy',
            'Taxonomy',
            `${revision.snapshotAuthorId || 'none'}, ${revision.snapshotCategoryIds.length} categories, ${revision.snapshotTagIds.length} tags`,
            `${input.selectedAuthorId || 'none'}, ${input.selectedCategoryIds.length} categories, ${input.selectedTagIds.length} tags`,
        );
    }

    const layerDelta = input.canvasStats.totalLayerCount - revision.snapshotCanvas.totalLayerCount;
    const rootLayerDelta = input.canvasStats.rootLayerCount - revision.snapshotCanvas.rootLayerCount;
    const canvasSizeChanged = (
        revision.snapshotCanvas.canvasWidth !== null &&
        revision.snapshotCanvas.canvasHeight !== null &&
        (revision.snapshotCanvas.canvasWidth !== input.canvasSize.width || revision.snapshotCanvas.canvasHeight !== input.canvasSize.height)
    );

    if (layerDelta !== 0 || rootLayerDelta !== 0 || canvasSizeChanged) {
        addChange(
            'canvas',
            'Canvas',
            `${revision.snapshotCanvas.totalLayerCount} layers, ${revision.snapshotCanvas.canvasWidth || '?'}x${revision.snapshotCanvas.canvasHeight || '?'}, depth ${revision.snapshotCanvas.maxDepth || 0}`,
            `${input.canvasStats.totalLayerCount} layers, ${input.canvasSize.width}x${input.canvasSize.height}, depth ${input.canvasStats.maxDepth || 0}`,
        );
    }

    if (elementDiff.totalChanged > 0) {
        addChange(
            'canvas elements',
            'Elements',
            `${elementDiff.snapshotElementCount} elements`,
            `${elementDiff.currentElementCount} elements; ${elementDiff.summary}`,
        );
    }

    return {
        id: revision.id,
        changedFields,
        details,
        summary: changedFields.length
            ? `${changedFields.length} changed area${changedFields.length === 1 ? '' : 's'}: ${changedFields.join(', ')}.`
            : 'Matches the current saved post summary.',
        currentLayerCount: input.canvasStats.totalLayerCount,
        snapshotLayerCount: revision.snapshotCanvas.totalLayerCount,
        layerDelta,
        currentRootLayerCount: input.canvasStats.rootLayerCount,
        snapshotRootLayerCount: revision.snapshotCanvas.rootLayerCount,
        rootLayerDelta,
        elementDiff,
        renderedPixelDiff,
    };
};

function EditBlogPostPage() {
    const navigate = useNavigate();
    const { postId } = Route.useParams();
    const routeSearch = Route.useSearch();
    const { sites, posts, media, updatePost, deletePost } = useStore();
    const currentAdmin = useAuthStore((state) => state.user);
    const storePost = posts.find((p) => p.id === postId);
    const storePostId = storePost?.id;
    const storePostSiteId = storePost?.siteId;
    const requestedSite = routeSearch.siteId
        ? sites.find((site) => siteMatchesIdentifier(site, routeSearch.siteId || ''))
        : undefined;
    const fallbackSiteId = requestedSite?.publicSiteId || requestedSite?.id || routeSearch.siteId || getSiteSelectionFromSearch(sites);
    const activeSite = useMemo(
        () => (
            storePostSiteId
                ? sites.find((site) => siteMatchesIdentifier(site, storePostSiteId))
                : sites.find((site) => siteMatchesIdentifier(site, fallbackSiteId))
        ) || sites[0],
        [fallbackSiteId, sites, storePostSiteId],
    );
    const activeSiteId = activeSite?.publicSiteId || activeSite?.id || storePostSiteId || fallbackSiteId || 'site-demo';
    const [post, setPost] = useState<BlogPost | null>(storePost || null);

    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingPost, setIsLoadingPost] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveWarning, setSaveWarning] = useState<string | null>(null);
    const [workflowNotice, setWorkflowNotice] = useState<string | null>(null);
    const [saveConflict, setSaveConflict] = useState<{ expectedUpdatedAt?: string; currentUpdatedAt?: string } | null>(null);
    const [isWorkflowBusy, setIsWorkflowBusy] = useState(false);
    const [isPreviewBusy, setIsPreviewBusy] = useState(false);
    const [isCheckingRoutes, setIsCheckingRoutes] = useState(false);
    const [routeCheckError, setRouteCheckError] = useState<string | null>(null);
    const [routeCheckRetry, setRouteCheckRetry] = useState(0);
    const [existingBlogPosts, setExistingBlogPosts] = useState<BlogPost[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewExpiresAt, setPreviewExpiresAt] = useState<string | null>(null);
    const [revisions, setRevisions] = useState<ContentRevision[]>([]);
    const [isRevisionTimelineExpanded, setIsRevisionTimelineExpanded] = useState(false);
    const [authors, setAuthors] = useState<BlogAuthor[]>([]);
    const [categories, setCategories] = useState<BlogCategory[]>([]);
    const [tags, setTags] = useState<BlogTag[]>([]);
    const [postComments, setPostComments] = useState<AdminComment[]>([]);
    const [postCommentCount, setPostCommentCount] = useState(0);
    const [isCommentsLoading, setIsCommentsLoading] = useState(false);
    const [commentError, setCommentError] = useState<string | null>(null);
    const [updatingCommentIds, setUpdatingCommentIds] = useState<string[]>([]);
    const [newsletterIssueDraft, setNewsletterIssueDraft] = useState<NewsletterIssueDraftHandoff | null>(null);
    const [isBuildingNewsletterIssueDraft, setIsBuildingNewsletterIssueDraft] = useState(false);
    const [newsletterIssueDraftError, setNewsletterIssueDraftError] = useState<string | null>(null);
    const [postReadiness, setPostReadiness] = useState<BlogPostReadiness | null>(null);
    const [readinessLoading, setReadinessLoading] = useState(false);
    const [readinessError, setReadinessError] = useState<string | null>(null);
    const [pendingRestoreRevision, setPendingRestoreRevision] = useState<ContentRevision | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isFeaturedMediaOpen, setIsFeaturedMediaOpen] = useState(false);
    const [isWorkspaceFocus, setIsWorkspaceFocus] = useState(routeSearch.focus === 'canvas');
    const [permissionMatrix, setPermissionMatrix] = useState<AdminUserPermissionMatrix | null>(null);
    const [isPermissionsLoading, setIsPermissionsLoading] = useState(Boolean(currentAdmin?.id));
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const isPermissionMatrixPending = isPermissionsLoading && !permissionMatrix;
    const canViewBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canEditBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.edit', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canPublishBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.publish', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canDeleteBlog = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'pages.delete', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canViewMedia = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canCreateMedia = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'media.create', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canViewCollections = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'collections.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canViewComments = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canManageComments = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'comments.manage', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const canExportNewsletter = isAdminPermissionAllowed(permissionMatrix, currentAdmin, 'forms.export', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewBlogPermissionTitle = canViewBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const editBlogPermissionTitle = canEditBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.edit', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const publishBlogPermissionTitle = canPublishBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.publish', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const deleteBlogPermissionTitle = canDeleteBlog ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'pages.delete', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewMediaPermissionTitle = canViewMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const createMediaPermissionTitle = canCreateMedia ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'media.create', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewCollectionsPermissionTitle = canViewCollections ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'collections.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const commentsViewPermissionTitle = canViewComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.view', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const commentsManagePermissionTitle = canManageComments ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'comments.manage', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const exportNewsletterPermissionTitle = canExportNewsletter ? undefined : adminPermissionReason(permissionMatrix, currentAdmin, 'forms.export', BLOG_EDITOR_PERMISSION_ROLE_DEFAULTS);
    const viewBlogDeniedMessage = `Your account needs pages.view to load this blog post. ${viewBlogPermissionTitle}`;
    const editBlogDeniedMessage = `Your account needs pages.edit to change this blog post. ${editBlogPermissionTitle}`;
    const publishBlogDeniedMessage = `Your account needs pages.publish to preview or publish this blog post. ${publishBlogPermissionTitle}`;
    const deleteBlogDeniedMessage = `Your account needs pages.delete to delete this blog post. ${deleteBlogPermissionTitle}`;
    const viewMediaDeniedMessage = `Your account needs media.view to select featured media. ${viewMediaPermissionTitle}`;
    const createMediaDeniedMessage = `Your account needs media.create to upload featured media. ${createMediaPermissionTitle}`;
    const viewCollectionsDeniedMessage = `Your account needs collections.view to bind blog canvas elements to collection data. ${viewCollectionsPermissionTitle}`;
    const manageCommentsDeniedMessage = `Your account needs comments.manage to moderate comments. ${commentsManagePermissionTitle}`;
    const exportNewsletterDeniedMessage = `Your account needs forms.export to build newsletter issue drafts with subscriber sync metadata. ${exportNewsletterPermissionTitle}`;

    // Initialize State from Post
    const [title, setTitle] = useState(post?.title || '');
    const [slug, setSlug] = useState(post?.slug || '');
    const [excerpt, setExcerpt] = useState(post?.excerpt || '');
    const [status, setStatus] = useState<ContentStatus>(post?.status || 'draft');
    const [scheduledAt, setScheduledAt] = useState<string | null>(post?.scheduledAt || null);
    const [seoTitle, setSeoTitle] = useState(getMetaString(post?.meta, 'title') || post?.title || '');
    const [seoDescription, setSeoDescription] = useState(getMetaString(post?.meta, 'description') || post?.excerpt || '');
    const [canonicalPath, setCanonicalPath] = useState(getMetaString(post?.meta, 'canonical') || (post?.slug ? `/blog/${post.slug}` : ''));
    const [ogImage, setOgImage] = useState(getMetaString(post?.meta, 'ogImage'));
    const [noIndex, setNoIndex] = useState(getMetaBoolean(post?.meta, 'noIndex'));
    const [noFollow, setNoFollow] = useState(getMetaBoolean(post?.meta, 'noFollow'));
    const [featuredImageId, setFeaturedImageId] = useState<string | null>(post?.featuredImageId || null);
    const [selectedAuthorId, setSelectedAuthorId] = useState(post?.author || 'admin');
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(post?.categoryIds || []);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>(post?.tagIds || []);

    const clearEditorFeedback = () => {
        setSaveWarning((current) => current ? null : current);
        setWorkflowNotice((current) => current ? null : current);
        setPreviewUrl((current) => current ? null : current);
        setPreviewExpiresAt((current) => current ? null : current);
        setPostReadiness((current) => current ? null : current);
        setReadinessError((current) => current ? null : current);
    };

    const loadBlogEditorPermissions = useCallback(() => {
        let cancelled = false;
        setPermissionError(null);

        if (!currentAdmin?.id) {
            setPermissionMatrix(null);
            setPermissionError('Sign in with an admin account to load blog editor permissions.');
            setIsPermissionsLoading(false);
            return () => {
                cancelled = true;
            };
        }

        setIsPermissionsLoading(true);
        getUserPermissions(currentAdmin.id)
            .then((matrix) => {
                if (!cancelled) {
                    setPermissionMatrix(matrix);
                    setPermissionError(null);
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setPermissionMatrix(null);
                    setPermissionError(error instanceof Error ? error.message : 'Unable to load blog editor permissions.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setIsPermissionsLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [currentAdmin?.id]);

    useEffect(() => loadBlogEditorPermissions(), [loadBlogEditorPermissions]);

    useEffect(() => {
        let cancelled = false;
        const localFallbackPost = storePost;

        const loadPost = async () => {
            if (!canViewBlog) {
                setIsLoadingPost(false);
                setLoadError(viewBlogDeniedMessage);
                return;
            }

            setIsLoadingPost(true);
            setLoadError(null);

            try {
                const backendPost = await getBlogPost(activeSiteId, postId);
                if (!cancelled) {
                    setPost(backendPost);
                    updatePost(postId, backendPost);
                    setTitle(backendPost.title);
                    setSlug(backendPost.slug);
                    setExcerpt(backendPost.excerpt);
                    setStatus(backendPost.status);
                    setScheduledAt(backendPost.scheduledAt || null);
                    setSeoTitle(getMetaString(backendPost.meta, 'title') || backendPost.title);
                    setSeoDescription(getMetaString(backendPost.meta, 'description') || backendPost.excerpt);
                    setCanonicalPath(getMetaString(backendPost.meta, 'canonical') || `/blog/${backendPost.slug}`);
                    setOgImage(getMetaString(backendPost.meta, 'ogImage'));
                    setNoIndex(getMetaBoolean(backendPost.meta, 'noIndex'));
                    setNoFollow(getMetaBoolean(backendPost.meta, 'noFollow'));
                    setFeaturedImageId(backendPost.featuredImageId || null);
                    setSelectedAuthorId(backendPost.author || 'admin');
                    setSelectedCategoryIds(backendPost.categoryIds || []);
                    setSelectedTagIds(backendPost.tagIds || []);
                }
            } catch (error) {
                if (!cancelled) {
                    if (localFallbackPost) {
                        setPost(localFallbackPost);
                        setScheduledAt(localFallbackPost.scheduledAt || null);
                        setSeoTitle(getMetaString(localFallbackPost.meta, 'title') || localFallbackPost.title);
                        setSeoDescription(getMetaString(localFallbackPost.meta, 'description') || localFallbackPost.excerpt);
                        setCanonicalPath(getMetaString(localFallbackPost.meta, 'canonical') || `/blog/${localFallbackPost.slug}`);
                        setOgImage(getMetaString(localFallbackPost.meta, 'ogImage'));
                        setNoIndex(getMetaBoolean(localFallbackPost.meta, 'noIndex'));
                        setNoFollow(getMetaBoolean(localFallbackPost.meta, 'noFollow'));
                        setFeaturedImageId(localFallbackPost.featuredImageId || null);
                        setSelectedAuthorId(localFallbackPost.author || 'admin');
                        setSelectedCategoryIds(localFallbackPost.categoryIds || []);
                        setSelectedTagIds(localFallbackPost.tagIds || []);
                        setLoadError(error instanceof Error ? error.message : 'Unable to load backend post.');
                    } else {
                        setPost(null);
                        setLoadError(error instanceof Error ? error.message : 'Unable to load post.');
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingPost(false);
                }
            }
        };

        void loadPost();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, postId, storePost, storePostId, updatePost, viewBlogDeniedMessage]);

    useEffect(() => {
        let cancelled = false;

        const loadTaxonomy = async () => {
            if (!canViewBlog) {
                setAuthors([]);
                setCategories([]);
                setTags([]);
                return;
            }

            try {
                const [backendAuthors, backendCategories, backendTags] = await Promise.all([
                    listBlogAuthors(activeSiteId),
                    listBlogCategories(activeSiteId),
                    listBlogTags(activeSiteId),
                ]);
                if (!cancelled) {
                    setAuthors(backendAuthors);
                    setCategories(backendCategories);
                    setTags(backendTags);
                }
            } catch {
                if (!cancelled) {
                    setCategories([]);
                    setTags([]);
                }
            }
        };

        void loadTaxonomy();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog]);

    useEffect(() => {
        if (!post) {
            setExistingBlogPosts([]);
            setRouteCheckError(null);
            return;
        }

        let cancelled = false;

        const loadExistingPosts = async () => {
            if (!canViewBlog) {
                setExistingBlogPosts([]);
                setRouteCheckError(viewBlogDeniedMessage);
                setIsCheckingRoutes(false);
                return;
            }

            setIsCheckingRoutes(true);
            setRouteCheckError(null);

            try {
                const backendPosts = await listBlogPosts(activeSiteId);
                if (!cancelled) {
                    setExistingBlogPosts(backendPosts);
                    setRouteCheckError(null);
                }
            } catch (loadError) {
                if (!cancelled) {
                    const message = loadError instanceof Error ? loadError.message : 'Unable to verify existing blog routes for this site.';
                    setExistingBlogPosts([]);
                    setRouteCheckError(message);
                }
            } finally {
                if (!cancelled) {
                    setIsCheckingRoutes(false);
                }
            }
        };

        void loadExistingPosts();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, post, routeCheckRetry, viewBlogDeniedMessage]);

    // Canvas State (Content Body)
    const {
      elements: savedElements,
      canvasSize: savedCanvasSize,
      customCSS: savedCustomCSS,
      customJS: savedCustomJS,
      themeTokenRefs: savedThemeTokenRefs,
      assets: savedDesignAssets,
      interactions: savedDesignInteractions,
      seo: savedDesignSeo,
      dataBindings: savedDesignDataBindings,
      editableMap: savedEditableMap,
      metadata: savedDesignMetadata,
      contentDocument: savedContentDocument,
    } = useMemo(
      () => normalizeSavedCanvasContent(post?.content),
      [post?.content]
    );

    const initialElements: CanvasElement[] = useMemo(() => {
      if (!post) return [];
      if (savedElements.length) return savedElements;

      // Fallback: Wrap legacy plain-text content in a Text element
      const content = post.content?.trim() || 'Start writing...';
      return [
        createCanvasElement('text', 50, 50, {
          width: 800,
          height: 600,
          props: {
            content,
            fontSize: 18,
            lineHeight: 1.6,
            color: '#334155',
          },
        }),
      ];
    }, [post, savedElements]);

    const [canvasElements, setCanvasElements] = useState<CanvasElement[]>(initialElements);
    const [canvasSize, setCanvasSize] = useState<CanvasSize>(savedCanvasSize);
    const canvasTreeStats = useMemo(() => getBlogCanvasTreeStats(canvasElements), [canvasElements]);
    const revisionDiffById = useMemo(() => new Map(revisions.map((revision) => [
        revision.id,
        blogRevisionDiff(revision, {
            title,
            slug,
            status,
            excerpt,
            seoTitle,
            seoDescription,
            featuredImageId,
            selectedAuthorId,
            selectedCategoryIds,
            selectedTagIds,
            canvasSize,
            canvasStats: canvasTreeStats,
            canvasElements,
        }),
    ])), [
        canvasElements,
        canvasSize,
        canvasTreeStats,
        excerpt,
        featuredImageId,
        revisions,
        selectedAuthorId,
        selectedCategoryIds,
        selectedTagIds,
        seoDescription,
        seoTitle,
        slug,
        status,
        title,
    ]);
    const blogRevisionBranchGraph = useMemo(() => buildBlogRevisionBranchGraph(revisions), [revisions]);
    const blogRevisionTimeline = blogRevisionBranchGraph.nodes;
    const blogRevisionBranchGraphText = useMemo(
        () => JSON.stringify(blogRevisionBranchGraph, null, 2),
        [blogRevisionBranchGraph],
    );
    const blogRevisionTimelineById = useMemo(
        () => new Map(blogRevisionTimeline.map((node) => [node.id, node])),
        [blogRevisionTimeline],
    );
    const visibleRevisions = useMemo(
        () => (isRevisionTimelineExpanded ? revisions : revisions.slice(0, BLOG_REVISION_COLLAPSED_COUNT)),
        [isRevisionTimelineExpanded, revisions],
    );
    const visibleRevisionIds = useMemo(() => new Set(visibleRevisions.map((revision) => revision.id)), [visibleRevisions]);
    const hiddenRevisionCount = Math.max(0, revisions.length - visibleRevisions.length);
    const expandRevisionTimelineTo = (revisionId: string) => {
        setIsRevisionTimelineExpanded(true);
        window.setTimeout(() => {
            document.getElementById(`blog-editor-revision-${revisionId}`)?.scrollIntoView({ block: 'start' });
        }, 0);
    };
    const interactiveReadinessIssues = useMemo(
      () => collectInteractiveReadinessIssues(canvasElements),
      [canvasElements],
    );
    const interactivePublishDisabledReason = interactiveReadinessIssues.length
      ? `Resolve interactive block readiness before publishing: ${interactiveReadinessIssues[0]}`
      : null;
    const interactivePublishReady = interactiveReadinessIssues.length === 0;
    const currentDesignDocument = useMemo(() => canvasElementsToBackyContentDocument({
        id: post?.id || postId,
        kind: 'post',
        title: title || post?.title,
        slug: slugify(slug || post?.slug || postId),
        status,
        locale: 'en',
        elements: canvasElements,
        canvasSize,
        customCSS: savedCustomCSS,
        customJS: savedCustomJS,
        themeTokenRefs: savedThemeTokenRefs,
        assets: savedDesignAssets,
        interactions: savedDesignInteractions,
        seo: savedDesignSeo,
        dataBindings: savedDesignDataBindings,
        editableMap: savedEditableMap,
        metadata: savedDesignMetadata,
    }), [
        canvasElements,
        canvasSize,
        post?.id,
        post?.slug,
        post?.title,
        postId,
        savedCustomCSS,
        savedCustomJS,
        savedDesignAssets,
        savedDesignDataBindings,
        savedDesignInteractions,
        savedDesignMetadata,
        savedDesignSeo,
        savedEditableMap,
        savedThemeTokenRefs,
        slug,
        status,
        title,
    ]);

    const loadPostReadiness = useCallback(async () => {
      if (!canViewBlog) {
        setReadinessError(viewBlogDeniedMessage);
        return null;
      }

      setReadinessLoading(true);
      setReadinessError(null);

      try {
        const readiness = await getBlogPostReadiness(activeSiteId, postId);
        setPostReadiness(readiness);
        return readiness;
      } catch (error) {
        setReadinessError(error instanceof Error ? error.message : 'Unable to load post readiness.');
        return null;
      } finally {
        setReadinessLoading(false);
      }
    }, [activeSiteId, canViewBlog, postId, viewBlogDeniedMessage]);

    const loadPostComments = useCallback(async () => {
      if (!canViewComments) {
        setPostComments([]);
        setPostCommentCount(0);
        setCommentError(`Your account needs comments.view to load post comments. ${commentsViewPermissionTitle}`);
        return;
      }

      setIsCommentsLoading(true);
      setCommentError(null);

      try {
        const result = await listAllComments(activeSiteId, {
          targetType: 'post',
          targetId: postId,
          status: 'all',
          limit: 100,
          sort: 'newest',
        });
        setPostComments(result.comments);
        setPostCommentCount(result.count);
      } catch (error) {
        setPostComments([]);
        setPostCommentCount(0);
        setCommentError(error instanceof Error ? error.message : 'Unable to load post comments.');
      } finally {
        setIsCommentsLoading(false);
      }
    }, [activeSiteId, canViewComments, commentsViewPermissionTitle, postId]);

    useEffect(() => {
      setCanvasElements(initialElements);
      setCanvasSize(savedCanvasSize);
    }, [initialElements, savedCanvasSize]);

    useEffect(() => {
      if (!post) {
        setPostReadiness(null);
        return;
      }

      void loadPostReadiness();
    }, [loadPostReadiness, post]);

    useEffect(() => {
      if (!post) {
        setPostComments([]);
        setPostCommentCount(0);
        return;
      }

      void loadPostComments();
    }, [loadPostComments, post]);

    useEffect(() => {
        setIsWorkspaceFocus(routeSearch.focus === 'canvas');
    }, [routeSearch.focus]);

    useEffect(() => {
        if (!post) {
            return;
        }
        if (!canViewBlog) {
            setRevisions([]);
            return;
        }

        let cancelled = false;

        const loadRevisions = async () => {
            try {
                const nextRevisions = await listBlogPostRevisions(activeSiteId, postId);
                if (!cancelled) {
                    setRevisions(nextRevisions);
                }
            } catch {
                if (!cancelled) {
                    setRevisions([]);
                }
            }
        };

        void loadRevisions();

        return () => {
            cancelled = true;
        };
    }, [activeSiteId, canViewBlog, post, postId]);

    if (isLoadingPost && !post) {
        return (
            <PageShell title="Loading post" description="Fetching editor content from the backend.">
                <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    Loading blog editor...
                </div>
            </PageShell>
        );
    }

    if (!post) {
        return (
            <PageShell title="Post Not Found" description={loadError || "The article you requested doesn't exist."}>
                <button onClick={() => navigate({ to: '/blog', search: { siteId: activeSiteId } })} className="text-primary hover:underline">
                    &larr; Back to Blog
                </button>
            </PageShell>
        );
    }

    const isUsingLocalPostCopy = Boolean(loadError);
    const localPostCopyDisabledMessage = 'Reload the latest backend post before editing, previewing, publishing, archiving, deleting, or restoring. The local post copy is read-only.';

    const dummySettings: PageSettings = {
        title,
        slug,
        status,
        scheduledAt,
        meta: { title: seoTitle || title, description: seoDescription || excerpt },
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEditBlog || (status === 'published' || status === 'scheduled') && !canPublishBlog) {
            setSaveWarning(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }
        if (isUsingLocalPostCopy) {
            setSaveWarning(localPostCopyDisabledMessage);
            setWorkflowNotice(null);
            return;
        }
        const currentScheduleValidationMessage = getScheduledBlogEditorDateError(status, scheduledAt);
        if (currentScheduleValidationMessage) {
            setSaveWarning(currentScheduleValidationMessage);
            setWorkflowNotice(null);
            return;
        }
        if (!canSave) {
            setSaveWarning(
                isCheckingRoutes
                    ? 'Checking existing blog routes before saving.'
                    : routeCheckError
                        ? 'Backy could not verify existing blog routes for this site. Retry the route check before saving.'
                        : routeConflict
                            ? `The ${publicPath} route is already used by "${routeConflict.title}". Choose another slug or edit that post first.`
                            : !canonicalValid
                                ? 'Canonical path must start with / before saving.'
                                : (status === 'published' || status === 'scheduled') && interactivePublishDisabledReason
                                    ? interactivePublishDisabledReason
                                : scheduleValidationMessage
                                    ? scheduleValidationMessage
                                    : 'Add a title and URL slug before saving.',
            );
            setWorkflowNotice(null);
            return;
        }

        if (saveActionBusy) return;

        setIsLoading(true);
        setSaveWarning(null);

        const content = serializeCanvasContent(canvasElements, canvasSize, savedCustomCSS, {
            documentId: post.id,
            kind: 'post',
            title,
            slug,
            status,
            locale: 'en',
            customJS: savedCustomJS,
            themeTokenRefs: savedThemeTokenRefs,
            assets: savedDesignAssets,
            interactions: savedDesignInteractions,
            seo: savedDesignSeo,
            dataBindings: savedDesignDataBindings,
            editableMap: savedEditableMap,
            metadata: savedDesignMetadata,
        });
        try {
            const savedPost = await updateBlogPost(activeSiteId, postId, {
                title,
                slug: normalizedSlug,
                excerpt,
                status,
                scheduledAt: status === 'scheduled' ? scheduledAt : null,
                featuredImageId,
                content: JSON.parse(content),
                meta: {
                    title: seoTitle.trim() || title,
                    description: seoDescription.trim() || excerpt,
                    canonical: normalizedCanonicalPath,
                    ogImage: ogImage.trim() || null,
                    noIndex,
                    noFollow,
                },
                authorId: selectedAuthorId || 'admin',
                categoryIds: selectedCategoryIds,
                tagIds: selectedTagIds,
                revisionNote: 'Before blog editor save',
                updatedBy: 'admin',
                expectedUpdatedAt: post.updatedAt,
            });
            syncPostState(savedPost);
            setSaveConflict(null);
            setWorkflowNotice('Post saved and revision snapshot recorded.');
            void loadPostReadiness();
        } catch (error) {
            if (error instanceof AdminContentApiError && error.code === 'BLOG_VERSION_CONFLICT') {
                const details = isRecord(error.details) ? error.details : {};
                const expectedUpdatedAt = typeof details.expectedUpdatedAt === 'string' ? details.expectedUpdatedAt : post.updatedAt;
                const currentUpdatedAt = typeof details.currentUpdatedAt === 'string' ? details.currentUpdatedAt : undefined;
                setSaveConflict({ expectedUpdatedAt, currentUpdatedAt });
                setSaveWarning('This post changed after the editor loaded it. Reload the latest backend copy before saving again.');
            } else {
                setSaveConflict(null);
                setSaveWarning(error instanceof Error
                    ? `${error.message}. Changes were not persisted.`
                    : 'Backend save failed. Changes were not persisted.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const syncPostState = (nextPost: BlogPost) => {
        setPost(nextPost);
        updatePost(postId, nextPost);
        setTitle(nextPost.title);
        setSlug(nextPost.slug);
        setExcerpt(nextPost.excerpt);
        setStatus(nextPost.status);
        setScheduledAt(nextPost.scheduledAt || null);
        setSeoTitle(getMetaString(nextPost.meta, 'title') || nextPost.title);
        setSeoDescription(getMetaString(nextPost.meta, 'description') || nextPost.excerpt);
        setCanonicalPath(getMetaString(nextPost.meta, 'canonical') || `/blog/${nextPost.slug}`);
        setOgImage(getMetaString(nextPost.meta, 'ogImage'));
        setNoIndex(getMetaBoolean(nextPost.meta, 'noIndex'));
        setNoFollow(getMetaBoolean(nextPost.meta, 'noFollow'));
        setFeaturedImageId(nextPost.featuredImageId || null);
        setSelectedAuthorId(nextPost.author || 'admin');
        setSelectedCategoryIds(nextPost.categoryIds || []);
        setSelectedTagIds(nextPost.tagIds || []);
        setSaveConflict(null);
    };

    const reloadLatestPost = async () => {
        if (editorActionBusy) return;
        if (!canViewBlog) {
            setSaveWarning(viewBlogDeniedMessage);
            return;
        }

        setIsLoadingPost(true);
        setSaveWarning(null);
        setWorkflowNotice(null);
        try {
            const latestPost = await getBlogPost(activeSiteId, postId);
            syncPostState(latestPost);
            setLoadError(null);
            setWorkflowNotice('Latest backend post loaded into the editor.');
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to reload the latest post.');
        } finally {
            setIsLoadingPost(false);
        }
    };

    const toggleSelection = (
        id: string,
        selectedIds: string[],
        setSelectedIds: Dispatch<SetStateAction<string[]>>,
    ) => {
        if (!canEditBlog) {
            setSaveWarning(editBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        clearEditorFeedback();
        setSelectedIds(
            selectedIds.includes(id)
                ? selectedIds.filter((selectedId) => selectedId !== id)
                : [...selectedIds, id],
        );
    };

    const applyWorkflow = async (action: 'publish' | 'archive') => {
        if (editorActionBusy || (action === 'publish' && (readinessBlocked || routeBlocked || !interactivePublishReady || status === 'published')) || (action === 'archive' && status === 'archived')) {
            return;
        }
        if (action === 'publish' && !canPublishBlog) {
            setSaveWarning(publishBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }
        if (action === 'archive' && !canEditBlog) {
            setSaveWarning(editBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }
        if (isUsingLocalPostCopy) {
            setSaveWarning(localPostCopyDisabledMessage);
            setWorkflowNotice(null);
            return;
        }

        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
            if (action === 'publish') {
                if (editorHasUnsavedChanges) {
                    setSaveWarning('Save the post before publishing so the backend publishes the latest title, SEO, taxonomy, media, and canvas changes.');
                    return;
                }

                if (isCheckingRoutes || routeCheckError || routeConflict) {
                    setSaveWarning(routeCheckError
                        ? 'Backy could not verify existing blog routes for this site. Retry the route check before publishing.'
                        : routeConflict
                            ? `The ${publicPath} route is already used by "${routeConflict.title}". Choose another slug before publishing.`
                            : 'Backy is still checking route availability. Wait for the route check before publishing.');
                    return;
                }

                if (interactivePublishDisabledReason) {
                    setSaveWarning(interactivePublishDisabledReason);
                    return;
                }

                const readiness = await loadPostReadiness();
                if (!readiness) {
                    setSaveWarning('Backy could not verify post readiness. Retry the readiness check before publishing.');
                    return;
                }

                if (readiness.statusLabel === 'blocked') {
                    setSaveWarning('Resolve post readiness errors before publishing.');
                    return;
                }
            }

            if (action === 'archive' && editorHasUnsavedChanges) {
                setSaveWarning('Save or discard local post changes before archiving.');
                return;
            }

            const nextPost = action === 'publish'
                ? await publishBlogPost(activeSiteId, postId, { expectedUpdatedAt: post.updatedAt })
                : await archiveBlogPost(activeSiteId, postId, { expectedUpdatedAt: post.updatedAt });
            syncPostState(nextPost);
            setWorkflowNotice(action === 'publish' ? 'Post published.' : 'Post archived.');
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : `Unable to ${action} post.`);
        } finally {
            setIsWorkflowBusy(false);
        }
    };

    const generatePreview = async () => {
        if (editorPreviewBusy) return;
        if (!canPublishBlog) {
            setSaveWarning(publishBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }
        if (isUsingLocalPostCopy) {
            setSaveWarning(localPostCopyDisabledMessage);
            setWorkflowNotice(null);
            return;
        }

        setIsPreviewBusy(true);
        setSaveWarning(null);

        try {
            if (editorHasUnsavedChanges) {
                setSaveWarning('Save the post before generating a preview so the preview uses the latest editor changes.');
                return;
            }

            const preview = await createBlogPostPreview(activeSiteId, postId);
            setPreviewUrl(preview.url);
            setPreviewExpiresAt(preview.expiresAt);
            setWorkflowNotice('Preview link created.');
            window.open(preview.url, '_blank', 'noopener,noreferrer');
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to create post preview.');
        } finally {
            setIsPreviewBusy(false);
        }
    };

    const refreshPostReadiness = async () => {
        if (editorReadinessBusy) return;
        if (!canViewBlog) {
            setReadinessError(viewBlogDeniedMessage);
            return;
        }

        await loadPostReadiness();
    };

    const retryRouteCheck = () => {
        if (editorRouteCheckBusy) return;

        setRouteCheckRetry((value) => value + 1);
    };

    const restoreRevision = async (revision: ContentRevision) => {
        if (editorActionBusy) return;
        if (!canEditBlog) {
            setSaveWarning(editBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }
        if (isUsingLocalPostCopy) {
            setSaveWarning(localPostCopyDisabledMessage);
            setWorkflowNotice(null);
            return;
        }

        setIsWorkflowBusy(true);
        setSaveWarning(null);
        setWorkflowNotice(null);

        try {
            if (editorHasUnsavedChanges) {
                setSaveWarning('Save or discard local post changes before restoring a revision.');
                return;
            }

            const restoredPost = await rollbackBlogPost(activeSiteId, postId, revision.id);
            syncPostState(restoredPost);
            setWorkflowNotice('Post revision restored.');
            setPendingRestoreRevision(null);
            void loadPostReadiness();
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to restore post revision.');
        } finally {
            setIsWorkflowBusy(false);
        }
    };

    const moderatePostComments = async (
        commentIds: string[],
        nextStatus: CommentModerationStatus,
        reason?: string,
    ) => {
        if (commentIds.length === 0 || updatingCommentIds.length > 0) return;
        if (!canManageComments) {
            setCommentError(manageCommentsDeniedMessage);
            return;
        }

        setUpdatingCommentIds(commentIds);
        setCommentError(null);
        setWorkflowNotice(null);

        try {
            const result = await updateComments(activeSiteId, {
                commentIds,
                status: nextStatus,
                actor: 'admin',
                reviewedBy: 'admin',
                ...(nextStatus === 'rejected' ? { rejectionReason: reason || 'Rejected from blog post editor.' } : {}),
                ...(nextStatus === 'spam' ? { rejectionReason: reason || 'Marked as spam from blog post editor.' } : {}),
                ...(nextStatus === 'blocked' ? { blockReason: reason || 'Blocked from blog post editor.' } : {}),
            });
            setPostComments((current) => current.map((comment) => (
                result.updated.find((updated) => updated.id === comment.id) || comment
            )));
            setWorkflowNotice(`${result.updatedCount} comment${result.updatedCount === 1 ? '' : 's'} updated.`);
            void loadPostComments();
        } catch (error) {
            setCommentError(error instanceof Error ? error.message : 'Unable to update post comments.');
        } finally {
            setUpdatingCommentIds([]);
        }
    };

    const handleDelete = async () => {
        if (editorActionBusy) return;
        if (!canDeleteBlog) {
            setSaveWarning(deleteBlogDeniedMessage);
            return;
        }
        if (isUsingLocalPostCopy) {
            setSaveWarning(localPostCopyDisabledMessage);
            return;
        }

        setIsWorkflowBusy(true);
        setSaveWarning(null);

        try {
            await deleteBlogPost(activeSiteId, postId);
        } catch (error) {
            setSaveWarning(error instanceof Error ? error.message : 'Unable to delete post');
            setIsWorkflowBusy(false);
            return;
        }

        setShowDeleteConfirm(false);
        deletePost(postId);
        setIsWorkflowBusy(false);
        navigate({ to: '/blog', search: { siteId: activeSiteId } });
    };

    const setWorkspaceFocusRoute = (focused: boolean) => {
        if (isLoadingPost || isLoading || isWorkflowBusy) return;

        setIsWorkspaceFocus(focused);
        navigate({
            to: '/blog/$postId',
            params: { postId },
            search: {
                siteId: activeSiteId,
                ...(focused ? { focus: 'canvas' as const } : {}),
            },
            replace: true,
        });
    };

    const normalizedSlug = slugify(slug || post.slug || postId);
    const publicPath = `/blog/${normalizedSlug || 'post-slug'}`;
    const normalizedCanonicalPath = normalizeCanonicalPath(canonicalPath || publicPath);
    const canonicalValid = normalizedCanonicalPath.startsWith('/');
    const savedRouteSlug = slugify(post.slug || '');
    const routeSettingsChanged = normalizedSlug !== savedRouteSlug;
    const routeConflict = normalizedSlug
        ? existingBlogPosts.find((existingPost) => existingPost.id !== postId && slugify(existingPost.slug) === normalizedSlug) || null
        : null;
    const routeBlocked = isCheckingRoutes || Boolean(routeCheckError) || Boolean(routeConflict);
    const routeSaveBlocked = Boolean(routeConflict) || (routeSettingsChanged && (isCheckingRoutes || Boolean(routeCheckError)));
    const routeAvailability = routeCheckError
        ? { status: 'unverified' as const, message: routeCheckError }
        : routeConflict
            ? { status: 'conflict' as const, postId: routeConflict.id, title: routeConflict.title, path: `/blog/${slugify(routeConflict.slug)}` }
            : { status: 'available' as const, checkedPosts: existingBlogPosts.length };
    const readinessFindings = postReadiness?.checks.filter((check) => check.status !== 'pass') || [];
    const readinessBlocked = postReadiness?.statusLabel === 'blocked';
    const readinessTone = postReadiness?.statusLabel === 'ready'
        ? 'border-green-200 bg-green-50 text-green-900'
        : readinessBlocked
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-amber-200 bg-amber-50 text-amber-900';
    const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
    const selectedSite = activeSite;
    const selectedFeaturedImage = featuredImageId
        ? media.find((asset) => asset.id === featuredImageId) || null
        : null;
    const selectedFeaturedImageUrl = selectedFeaturedImage
        ? selectedFeaturedImage.url || getPublicMediaFileUrl(selectedFeaturedImage.id, activeSiteId)
        : null;
    const selectedCategories = categories
        .filter((category) => selectedCategoryIds.includes(category.id))
        .map((category) => ({ id: category.id, name: category.name, slug: category.slug }));
    const selectedTags = tags
        .filter((tag) => selectedTagIds.includes(tag.id))
        .map((tag) => ({ id: tag.id, name: tag.name, slug: tag.slug }));
    const frontendDesignTemplate = {
        id: getMetaString(post.meta, 'frontendDesignTemplateId'),
        name: getMetaString(post.meta, 'frontendDesignTemplateName'),
        routePattern: getMetaString(post.meta, 'frontendDesignRoutePattern'),
        source: getMetaRecord(post.meta, 'frontendDesignSource'),
        chrome: getMetaRecord(post.meta, 'frontendDesignChrome'),
        tokens: getMetaRecord(post.meta, 'frontendDesignTokens'),
        customCss: getMetaString(post.meta, 'frontendDesignCustomCss'),
        bindingHints: getMetaArray(post.meta, 'frontendDesignBindingHints'),
    };
    const hasFrontendDesignTemplate = frontendDesignTemplate.id.length > 0;
    const isCommentMutationBusy = updatingCommentIds.length > 0;
    const commentsBusy = isCommentsLoading || isCommentMutationBusy;
    const commentMetrics = {
        total: postCommentCount || postComments.length,
        loaded: postComments.length,
        pending: postComments.filter((comment) => comment.status === 'pending').length,
        approved: postComments.filter((comment) => comment.status === 'approved').length,
        rejected: postComments.filter((comment) => comment.status === 'rejected').length,
        spam: postComments.filter((comment) => comment.status === 'spam').length,
        blocked: postComments.filter((comment) => comment.status === 'blocked').length,
        reported: postComments.filter((comment) => (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length)).length,
    };
    const flaggedCommentCount = commentMetrics.reported + commentMetrics.spam + commentMetrics.blocked;
    const pendingPostCommentIds = postComments
        .filter((comment) => comment.status === 'pending')
        .map((comment) => comment.id);
    const commentsModerated = !commentError && commentMetrics.pending === 0 && flaggedCommentCount === 0;
    const savedEditorSnapshot = {
        title: post.title || '',
        slug: slugify(post.slug || ''),
        excerpt: post.excerpt || '',
        status: post.status,
        scheduledAt: post.status === 'scheduled' ? post.scheduledAt || null : null,
        seoTitle: getMetaString(post.meta, 'title') || post.title || '',
        seoDescription: getMetaString(post.meta, 'description') || post.excerpt || '',
        canonicalPath: normalizeCanonicalPath(getMetaString(post.meta, 'canonical') || `/blog/${post.slug}`),
        ogImage: getMetaString(post.meta, 'ogImage'),
        noIndex: getMetaBoolean(post.meta, 'noIndex'),
        noFollow: getMetaBoolean(post.meta, 'noFollow'),
        featuredImageId: post.featuredImageId || null,
        authorId: post.author || 'admin',
        categoryIds: post.categoryIds || [],
        tagIds: post.tagIds || [],
        content: {
            elements: initialElements,
            canvasSize: savedCanvasSize,
        },
    };
    const currentEditorSnapshot = {
        title,
        slug: normalizedSlug,
        excerpt,
        status,
        scheduledAt: status === 'scheduled' ? scheduledAt || null : null,
        seoTitle: seoTitle.trim() || title,
        seoDescription: seoDescription.trim() || excerpt,
        canonicalPath: normalizedCanonicalPath,
        ogImage: ogImage.trim(),
        noIndex,
        noFollow,
        featuredImageId,
        authorId: selectedAuthorId || 'admin',
        categoryIds: selectedCategoryIds,
        tagIds: selectedTagIds,
        content: {
            elements: canvasElements,
            canvasSize,
        },
    };
    const editorHasUnsavedChanges = JSON.stringify(savedEditorSnapshot) !== JSON.stringify(currentEditorSnapshot);
    const scheduleValidationMessage = getScheduledBlogEditorDateError(status, scheduledAt);
    const hasFutureSchedule = scheduleValidationMessage === null;
    const minimumScheduledAt = toDateTimeLocalValue(new Date(Date.now() + 60_000).toISOString());
    const localReadinessChecks = [
        { label: 'Title', complete: title.trim().length > 0 },
        { label: 'Slug', complete: slug.trim().length > 0 },
        { label: 'Route', complete: !routeBlocked },
        { label: 'Summary', complete: excerpt.trim().length >= 24 },
        { label: 'SEO', complete: seoTitle.trim().length > 0 && seoDescription.trim().length >= 50 && canonicalValid },
        { label: 'Featured image', complete: Boolean(featuredImageId) },
        { label: 'Comments', complete: commentsModerated },
        { label: 'Design', complete: canvasElements.length > 0 },
        { label: 'Interactive blocks', complete: interactivePublishReady },
        { label: 'Schedule', complete: hasFutureSchedule },
    ];
    const localReadyCount = localReadinessChecks.filter((check) => check.complete).length;
    const canSave = title.trim().length > 0
        && normalizedSlug.length > 0
        && !routeSaveBlocked
        && canonicalValid
        && ((status !== 'published' && status !== 'scheduled') || interactivePublishReady)
        && hasFutureSchedule;
    const workspaceFocusDisabled = isLoadingPost || isLoading || isWorkflowBusy;
    const editorBusy = workspaceFocusDisabled;
    const editorCommandBusy = editorBusy;
    const editorPreviewBusy = editorBusy || isPreviewBusy;
    const editorReadinessBusy = editorBusy || readinessLoading;
    const editorRouteCheckBusy = editorBusy || isCheckingRoutes;
    const editorActionBusy = editorBusy || isPreviewBusy || readinessLoading;
    const saveActionBusy = editorBusy || isPreviewBusy || readinessLoading;
    const editorFormDisabled = editorBusy || !canEditBlog || isUsingLocalPostCopy;
    const submitLabel = status === 'published' ? 'Save published post' : status === 'scheduled' ? 'Schedule changes' : status === 'archived' ? 'Save archived post' : 'Save draft';
    const routeBlockedReason = routeCheckError
        ? 'Backy could not verify existing blog routes for this site. Retry the route check before publishing.'
        : routeConflict
            ? `The ${publicPath} route is already used by "${routeConflict.title}". Choose another slug before publishing.`
            : isCheckingRoutes
                ? 'Backy is still checking route availability. Wait for the route check before publishing.'
                : null;
    const routeSaveBlockedReason = routeConflict
        ? `The ${publicPath} route is already used by "${routeConflict.title}". Choose another slug or edit that post first.`
        : routeSettingsChanged && routeCheckError
            ? 'Backy could not verify existing blog routes for this site. Retry the route check before saving.'
            : routeSettingsChanged && isCheckingRoutes
                ? 'Checking existing blog routes before saving.'
                : null;
    const saveDisabledReason = !canEditBlog
        ? editBlogDeniedMessage
        : isUsingLocalPostCopy
            ? localPostCopyDisabledMessage
            : (status === 'published' || status === 'scheduled') && !canPublishBlog
                ? publishBlogDeniedMessage
                : !canSave
                    ? scheduleValidationMessage
                        || routeSaveBlockedReason
                        || (!canonicalValid ? 'Use a canonical path that starts with / before saving.' : null)
                        || (!interactivePublishReady ? interactivePublishDisabledReason : null)
                        || (!title.trim() ? 'Add a title before saving.' : null)
                        || (!normalizedSlug ? 'Add a slug before saving.' : null)
                        || 'Resolve editor validation before saving.'
                    : null;
    const publishWorkflowDisabledReason = !canPublishBlog
        ? publishBlogDeniedMessage
        : isUsingLocalPostCopy
            ? localPostCopyDisabledMessage
            : editorHasUnsavedChanges
                ? 'Save this post before publishing so the backend publishes the latest title, SEO, taxonomy, media, and canvas changes.'
                : status === 'published'
                    ? 'Post is already published.'
                    : routeBlockedReason
                        || interactivePublishDisabledReason
                        || (readinessBlocked
                            ? postReadiness?.checks.find((check) => check.status !== 'pass' && check.severity === 'error')?.message || 'Resolve post readiness errors before publishing.'
                            : null);
    const archiveWorkflowDisabledReason = !canEditBlog
        ? editBlogDeniedMessage
        : isUsingLocalPostCopy
            ? localPostCopyDisabledMessage
            : editorHasUnsavedChanges
                ? 'Save or discard local changes before archiving.'
                : status === 'archived'
                    ? 'Post is already archived.'
                    : null;
    const previewWorkflowDisabledReason = !canPublishBlog
        ? publishBlogDeniedMessage
        : isUsingLocalPostCopy
            ? localPostCopyDisabledMessage
            : editorHasUnsavedChanges
                ? 'Save this post before generating a preview.'
                : null;
    const blogEditorCommandBusyReason = editorCommandBusy
        ? 'Wait for the current blog editor workflow to finish.'
        : '';
    const blogEditorPreviewBusyReason = editorPreviewBusy
        ? isPreviewBusy
            ? 'Wait for the current blog preview to finish.'
            : blogEditorCommandBusyReason
        : '';
    const blogEditorReadinessBusyReason = editorReadinessBusy
        ? readinessLoading
            ? 'Wait for the current blog readiness check to finish.'
            : blogEditorCommandBusyReason
        : '';
    const blogEditorBusyReason = editorActionBusy
        ? isPreviewBusy
            ? blogEditorPreviewBusyReason
            : readinessLoading
                ? blogEditorReadinessBusyReason
                : blogEditorCommandBusyReason
        : '';
    const blogEditorFormDisabledReason = editorBusy
        ? blogEditorCommandBusyReason
        : !canEditBlog
            ? editBlogPermissionTitle || editBlogDeniedMessage
            : isUsingLocalPostCopy
                ? localPostCopyDisabledMessage
                : '';
    const blogEditorBackDisabledReason = editorCommandBusy
        ? 'Wait for the current blog editor workflow before returning to Blog.'
        : '';
    const blogEditorBackActionStatus = blogEditorBackDisabledReason
        ? `Back to Blog unavailable: ${blogEditorBackDisabledReason}`
        : `Back to Blog available for ${activeSiteId}.`;
    const blogEditorFocusDisabledReason = workspaceFocusDisabled
        ? isLoadingPost
            ? 'Wait for the post to finish loading before changing canvas focus.'
            : 'Wait for the current blog workflow before changing canvas focus.'
        : '';
    const blogEditorFocusActionStatus = blogEditorFocusDisabledReason
        ? `Canvas focus toggle unavailable: ${blogEditorFocusDisabledReason}`
        : isWorkspaceFocus
            ? 'Show blog panels available.'
            : 'Focus canvas available.';
    const blogEditorHandoffDisabledReason = editorCommandBusy
        ? blogEditorCommandBusyReason
        : !canViewBlog
            ? viewBlogPermissionTitle || viewBlogDeniedMessage
            : '';
    const blogEditorHandoffActionStatus = blogEditorHandoffDisabledReason
        ? `Blog editor handoff unavailable: ${blogEditorHandoffDisabledReason}`
        : 'Blog editor handoff ready for custom frontend sync.';
    const blogEditorNewsletterIssueDraftDisabledReason = isBuildingNewsletterIssueDraft
        ? 'Wait for the current newsletter issue draft build to finish.'
        : editorCommandBusy
            ? blogEditorCommandBusyReason
            : !canViewBlog
                ? viewBlogPermissionTitle || viewBlogDeniedMessage
                : !canExportNewsletter
                    ? exportNewsletterDeniedMessage
                    : editorHasUnsavedChanges
                        ? 'Save this post before building a newsletter issue draft so the API uses the latest title, excerpt, URLs, taxonomy, and canvas metadata.'
                        : '';
    const blogEditorNewsletterIssueDraftActionStatus = blogEditorNewsletterIssueDraftDisabledReason
        ? `Newsletter issue draft unavailable: ${blogEditorNewsletterIssueDraftDisabledReason}`
        : 'Newsletter issue draft build available for the send-ready subscriber audience.';
    const blogEditorSaveDisabledReason = saveActionBusy
        ? 'Wait for the current save, preview, or readiness workflow to finish.'
        : saveDisabledReason || '';
    const blogEditorSaveActionStatus = blogEditorSaveDisabledReason
        ? `Save unavailable: ${blogEditorSaveDisabledReason}`
        : `${submitLabel} available.`;
    const blogEditorPreviewDisabledReason = editorPreviewBusy
        ? blogEditorPreviewBusyReason
        : previewWorkflowDisabledReason || '';
    const blogEditorPreviewActionStatus = blogEditorPreviewDisabledReason
        ? `Preview unavailable: ${blogEditorPreviewDisabledReason}`
        : 'Preview available for this blog post.';
    const blogEditorReadinessDisabledReason = editorReadinessBusy
        ? blogEditorReadinessBusyReason
        : !canViewBlog
            ? viewBlogPermissionTitle || viewBlogDeniedMessage
            : '';
    const blogEditorReadinessActionStatus = blogEditorReadinessDisabledReason
        ? `Readiness refresh unavailable: ${blogEditorReadinessDisabledReason}`
        : 'Readiness refresh available.';
    const blogEditorPublishDisabledReason = editorActionBusy
        ? blogEditorBusyReason
        : publishWorkflowDisabledReason || '';
    const blogEditorPublishActionStatus = blogEditorPublishDisabledReason
        ? `Publish unavailable: ${blogEditorPublishDisabledReason}`
        : 'Publish available for this blog post.';
    const blogEditorArchiveDisabledReason = editorActionBusy
        ? blogEditorBusyReason
        : archiveWorkflowDisabledReason || '';
    const blogEditorArchiveActionStatus = blogEditorArchiveDisabledReason
        ? `Archive unavailable: ${blogEditorArchiveDisabledReason}`
        : 'Archive available for this blog post.';
    const blogEditorPublishImpactDisabledReason = editorCommandBusy
        ? blogEditorCommandBusyReason
        : !canViewBlog
            ? viewBlogPermissionTitle || viewBlogDeniedMessage
            : '';
    const blogEditorPublishImpactActionStatus = blogEditorPublishImpactDisabledReason
        ? `Publish impact copy unavailable: ${blogEditorPublishImpactDisabledReason}`
        : 'Publish impact copy available.';
    const blogEditorDiscardDisabledReason = editorCommandBusy
        ? 'Wait for the current blog editor workflow before discarding local navigation.'
        : '';
    const blogEditorDiscardActionStatus = blogEditorDiscardDisabledReason
        ? `Discard unavailable: ${blogEditorDiscardDisabledReason}`
        : 'Discard available. Return to Blog without saving local editor changes.';
    const blogEditorDeleteDisabledReason = editorActionBusy
        ? blogEditorBusyReason
        : isUsingLocalPostCopy
            ? localPostCopyDisabledMessage
            : !canDeleteBlog
                ? deleteBlogPermissionTitle || deleteBlogDeniedMessage
                : '';
    const blogEditorDeleteActionStatus = blogEditorDeleteDisabledReason
        ? `Delete unavailable: ${blogEditorDeleteDisabledReason}`
        : 'Delete post available. Confirmation is required.';
    const blogEditorDeleteCancelDisabledReason = editorCommandBusy
        ? blogEditorCommandBusyReason
        : '';
    const blogEditorDeleteCancelActionStatus = blogEditorDeleteCancelDisabledReason
        ? `Cancel delete unavailable: ${blogEditorDeleteCancelDisabledReason}`
        : 'Cancel delete available.';
    const blogEditorMediaSelectDisabledReason = editorBusy
        ? blogEditorBusyReason
        : isUsingLocalPostCopy
            ? localPostCopyDisabledMessage
            : !canEditBlog
                ? editBlogPermissionTitle || editBlogDeniedMessage
                : !canViewMedia
                    ? viewMediaPermissionTitle || viewMediaDeniedMessage
                    : '';
    const blogEditorMediaSelectActionStatus = blogEditorMediaSelectDisabledReason
        ? `Featured image selection unavailable: ${blogEditorMediaSelectDisabledReason}`
        : `${featuredImageId ? 'Replace' : 'Select'} featured image available.`;
    const blogEditorMediaClearDisabledReason = editorFormDisabled
        ? blogEditorFormDisabledReason
        : !featuredImageId
            ? 'Select a featured image before clearing it.'
            : '';
    const blogEditorMediaClearActionStatus = blogEditorMediaClearDisabledReason
        ? `Clear featured image unavailable: ${blogEditorMediaClearDisabledReason}`
        : 'Clear featured image available.';
    const blogEditorCommentsBusyReason = commentsBusy
        ? isCommentsLoading
            ? 'Wait for comments to finish loading.'
            : 'Wait for the current comment moderation workflow to finish.'
        : '';
    const blogEditorCommentsRefreshDisabledReason = blogEditorCommentsBusyReason
        || (!canViewComments ? commentsViewPermissionTitle || 'Your account needs comments.view to refresh post comments.' : '');
    const blogEditorCommentsRefreshActionStatus = blogEditorCommentsRefreshDisabledReason
        ? `Comments refresh unavailable: ${blogEditorCommentsRefreshDisabledReason}`
        : 'Comments refresh available.';
    const blogEditorCommentsOpenQueueDisabledReason = editorCommandBusy
        ? blogEditorCommandBusyReason
        : !canViewComments
            ? commentsViewPermissionTitle || 'Your account needs comments.view to open the comment queue.'
            : '';
    const blogEditorCommentsOpenQueueActionStatus = blogEditorCommentsOpenQueueDisabledReason
        ? `Open full comment queue unavailable: ${blogEditorCommentsOpenQueueDisabledReason}`
        : 'Open full comment queue available.';
    const blogEditorCommentsApiDisabledReason = editorCommandBusy
        ? blogEditorCommandBusyReason
        : !canViewBlog
            ? viewBlogPermissionTitle || viewBlogDeniedMessage
            : '';
    const blogEditorCommentsApiActionStatus = blogEditorCommentsApiDisabledReason
        ? `Copy comments API unavailable: ${blogEditorCommentsApiDisabledReason}`
        : 'Copy comments API available.';
    const blogEditorCommentsManageDisabledReason = blogEditorCommentsBusyReason
        || (!canManageComments ? commentsManagePermissionTitle || manageCommentsDeniedMessage : '');
    const blogEditorCommentsApprovePendingActionStatus = blogEditorCommentsManageDisabledReason
        ? `Approve pending comments unavailable: ${blogEditorCommentsManageDisabledReason}`
        : `${pendingPostCommentIds.length} pending comment${pendingPostCommentIds.length === 1 ? '' : 's'} can be approved.`;
    const blogEditorCommentsRejectPendingActionStatus = blogEditorCommentsManageDisabledReason
        ? `Reject pending comments unavailable: ${blogEditorCommentsManageDisabledReason}`
        : `${pendingPostCommentIds.length} pending comment${pendingPostCommentIds.length === 1 ? '' : 's'} can be rejected.`;
    const blogEditorRevisionGraphDisabledReason = editorCommandBusy
        ? blogEditorCommandBusyReason
        : '';
    const blogEditorRevisionGraphCopyActionStatus = blogEditorRevisionGraphDisabledReason
        ? `Copy revision graph unavailable: ${blogEditorRevisionGraphDisabledReason}`
        : 'Copy revision graph available.';
    const blogEditorRevisionGraphToggleActionStatus = blogEditorRevisionGraphDisabledReason
        ? `Revision timeline toggle unavailable: ${blogEditorRevisionGraphDisabledReason}`
        : isRevisionTimelineExpanded
            ? 'Show latest revisions available.'
            : `Show all ${revisions.length} revisions available.`;
    const blogEditorRestoreDisabledReason = editorActionBusy
        ? blogEditorBusyReason
        : isUsingLocalPostCopy
            ? localPostCopyDisabledMessage
            : editorHasUnsavedChanges
                ? 'Save or discard local changes before restoring a revision.'
                : !canEditBlog
                    ? editBlogPermissionTitle || editBlogDeniedMessage
                    : '';
    const blogEditorRestoreActionStatus = blogEditorRestoreDisabledReason
        ? `Restore revision unavailable: ${blogEditorRestoreDisabledReason}`
        : 'Restore revision available. Confirmation is required.';
    const blogEditorRestoreCancelDisabledReason = editorCommandBusy
        ? blogEditorCommandBusyReason
        : '';
    const blogEditorRestoreCancelActionStatus = blogEditorRestoreCancelDisabledReason
        ? `Cancel restore unavailable: ${blogEditorRestoreCancelDisabledReason}`
        : 'Cancel restore available.';
    const blogEditorTaxonomyDisabledReason = editorFormDisabled
        ? blogEditorFormDisabledReason
        : '';
    const blogEditorAuthorActionStatus = blogEditorTaxonomyDisabledReason
        ? `Author selection unavailable: ${blogEditorTaxonomyDisabledReason}`
        : `Author selection available. Current author is ${selectedAuthor?.name || selectedAuthorId}.`;
    const blogEditorTaxonomyActionStatus = blogEditorTaxonomyDisabledReason
        ? `Taxonomy selection unavailable: ${blogEditorTaxonomyDisabledReason}`
        : `${selectedCategoryIds.length} categor${selectedCategoryIds.length === 1 ? 'y' : 'ies'} and ${selectedTagIds.length} tag${selectedTagIds.length === 1 ? '' : 's'} selected.`;
    const getBlogEditorStatusDisabledReason = (nextStatus: ContentStatus) => {
        if (blogEditorFormDisabledReason) return blogEditorFormDisabledReason;
        if ((nextStatus === 'published' || nextStatus === 'scheduled') && !canPublishBlog) {
            return publishBlogPermissionTitle || publishBlogDeniedMessage;
        }
        return '';
    };
    const getBlogEditorStatusActionState = (nextStatus: ContentStatus) => {
        const disabledReason = getBlogEditorStatusDisabledReason(nextStatus);
        if (disabledReason) return editorBusy ? 'busy' : 'blocked';
        return status === nextStatus ? 'selected' : 'ready';
    };
    const getBlogEditorStatusActionStatus = (nextStatus: ContentStatus) => {
        const disabledReason = getBlogEditorStatusDisabledReason(nextStatus);
        if (disabledReason) return `Status ${nextStatus} unavailable: ${disabledReason}`;
        return status === nextStatus
            ? `Status ${nextStatus} selected.`
            : `Set status to ${nextStatus} available.`;
    };
    const blogEditorCommandActionStatusId = 'blog-editor-command-action-status';
    const blogEditorCommandActionStatus = [
        blogEditorHandoffActionStatus,
        blogEditorSaveActionStatus,
        blogEditorPreviewActionStatus,
        blogEditorReadinessActionStatus,
        blogEditorPublishActionStatus,
        blogEditorArchiveActionStatus,
        blogEditorPublishImpactActionStatus,
        blogEditorDiscardActionStatus,
        blogEditorDeleteActionStatus,
        blogEditorMediaSelectActionStatus,
        blogEditorMediaClearActionStatus,
        blogEditorCommentsRefreshActionStatus,
        blogEditorCommentsOpenQueueActionStatus,
        blogEditorCommentsApiActionStatus,
        blogEditorRevisionGraphCopyActionStatus,
        blogEditorRevisionGraphToggleActionStatus,
        blogEditorRestoreActionStatus,
        blogEditorAuthorActionStatus,
        blogEditorTaxonomyActionStatus,
    ].join(' ');
    const backendReadinessDetail = postReadiness
        ? `${postReadiness.score}% ${postReadiness.statusLabel.replace('-', ' ')}.`
        : readinessError || 'Run readiness before publishing.';
    const blogEditorChecks = [
        {
            label: 'Title',
            detail: title.trim() ? 'Article title is ready for frontend handoff.' : 'Add a title before saving.',
            ready: title.trim().length > 0,
        },
        {
            label: 'Route',
            detail: routeCheckError
                ? 'Route check failed. Retry before saving or publishing.'
                : routeConflict
                    ? `${publicPath} is already used by "${routeConflict.title}".`
                    : isCheckingRoutes
                        ? 'Checking route availability.'
                        : normalizedSlug
                            ? `${publicPath} is available in the current site.`
                            : 'Add a slug so public frontends can resolve the post.',
            ready: normalizedSlug.length > 0 && !routeBlocked,
        },
        {
            label: 'Excerpt',
            detail: excerpt.trim().length >= 24 ? `${excerpt.length} characters for feeds and SEO.` : 'Add a stronger summary for blog lists and previews.',
            ready: excerpt.trim().length >= 24,
        },
        {
            label: 'SEO controls',
            detail: `${seoTitle.trim().length || title.length} title chars, ${seoDescription.trim().length || excerpt.length} description chars, canonical ${normalizedCanonicalPath}.`,
            ready: seoTitle.trim().length > 0 && seoDescription.trim().length >= 50 && canonicalValid,
        },
        {
            label: 'Featured media',
            detail: featuredImageId
                ? selectedFeaturedImage
                    ? `${selectedFeaturedImage.name} selected for cards, feeds, and social previews.`
                    : `${featuredImageId} selected. Save keeps the backend reference even if the library preview is not loaded.`
                : 'Choose a featured image for blog lists, Open Graph previews, and generated frontends.',
            ready: Boolean(featuredImageId),
        },
        {
            label: 'Comments',
            detail: commentError
                ? 'Comment moderation state could not be loaded.'
                : commentMetrics.total === 0
                    ? 'No public comments exist for this post yet.'
                    : `${commentMetrics.pending} pending, ${commentMetrics.approved} approved, ${flaggedCommentCount} flagged/spam/blocked.`,
            ready: commentsModerated,
        },
        {
            label: 'Canvas content',
            detail: canvasElements.length > 0 ? `${canvasElements.length} root layer${canvasElements.length === 1 ? '' : 's'} ready.` : 'Add article layout elements.',
            ready: canvasElements.length > 0,
        },
        {
            label: 'Schedule',
            detail: status === 'scheduled' ? scheduleValidationMessage || 'Scheduled publish time is set.' : `${status} workflow selected.`,
            ready: hasFutureSchedule,
        },
        {
            label: 'Backend readiness',
            detail: backendReadinessDetail,
            ready: Boolean(postReadiness) && !readinessBlocked,
        },
        {
            label: 'Revision safety',
            detail: revisions.length > 0 ? `${revisions.length} saved revision${revisions.length === 1 ? '' : 's'}.` : 'Save once to create a restore point.',
            ready: revisions.length > 0,
        },
    ];
    const blogEditorReadyCount = blogEditorChecks.filter((check) => check.ready).length;
    const blogEditorReadiness = {
        score: Math.round((blogEditorReadyCount / blogEditorChecks.length) * 100),
        checks: blogEditorChecks,
        workflow: [
            { label: 'Write', detail: 'Set title, slug, excerpt, author, categories, and tags.' },
            { label: 'Design', detail: 'Compose the public article page with the shared visual editor.' },
            { label: 'Validate', detail: 'Refresh readiness for route, SEO, canvas, and publishing blockers.' },
            { label: 'Ship', detail: 'Preview, save, publish, schedule, or archive without leaving the editor.' },
        ],
    };
    const adminBlogPostUrl = `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/blog/${encodeURIComponent(postId)}`;
    const publicApiBase = getAdminApiBase().replace(/\/api\/admin$/, '/api');
    const publicBlogUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/blog`;
    const publicPostBySlugUrl = `${publicBlogUrl}?slug=${encodeURIComponent(normalizedSlug || post.slug || postId)}`;
    const publicRenderUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/render?path=${encodeURIComponent(publicPath)}`;
    const publicResolveUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/resolve?path=${encodeURIComponent(publicPath)}`;
    const publicPostCommentsUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/blog/${encodeURIComponent(postId)}/comments`;
    const moderationCommentsUrl = `${publicApiBase}/sites/${encodeURIComponent(activeSiteId)}/comments?targetType=post&targetId=${encodeURIComponent(postId)}&limit=100&sort=newest`;
    const newsletterSendableSubscribersUrl = `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/newsletter/subscribers?audience=sendable`;
    const newsletterHeldSubscribersUrl = `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/newsletter/subscribers?audience=held`;
    const newsletterContactSyncUrl = `${getAdminApiBase()}/sites/${encodeURIComponent(activeSiteId)}/forms/{formId}/contacts/sync`;
    const siteCommentPolicy = selectedSite?.settings?.commentPolicy || null;
    const blogPublishImpact = {
        schemaVersion: 'backy.blog-publish-impact.v1',
        generatedAt: new Date().toISOString(),
        post: {
            id: post.id,
            title: title || post.title,
            slug: normalizedSlug || post.slug,
            path: publicPath,
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
        },
        route: {
            path: publicPath,
            canonical: normalizedCanonicalPath,
            backendVerified: !isCheckingRoutes && !routeCheckError,
            checkedPosts: existingBlogPosts.length,
            availability: routeAvailability,
            conflict: routeConflict
                ? {
                    id: routeConflict.id,
                    title: routeConflict.title,
                    path: `/blog/${slugify(routeConflict.slug)}`,
                }
                : null,
            blockedReason: routeBlockedReason,
        },
        taxonomy: {
            author: selectedAuthor
                ? { id: selectedAuthor.id, name: selectedAuthor.name }
                : { id: selectedAuthorId, name: selectedAuthorId },
            categoryCount: selectedCategoryIds.length,
            tagCount: selectedTagIds.length,
            categories: selectedCategories,
            tags: selectedTags,
            unresolvedCategoryIds: selectedCategoryIds.filter((id) => !selectedCategories.some((category) => category.id === id)),
            unresolvedTagIds: selectedTagIds.filter((id) => !selectedTags.some((tag) => tag.id === id)),
        },
        media: {
            featuredImageId,
            featuredImageReady: Boolean(selectedFeaturedImage),
            featuredImage: selectedFeaturedImage
                ? {
                    id: selectedFeaturedImage.id,
                    name: selectedFeaturedImage.name,
                    url: selectedFeaturedImageUrl,
                    altText: selectedFeaturedImage.altText || null,
                    visibility: selectedFeaturedImage.visibility || null,
                }
                : featuredImageId
                    ? { id: featuredImageId, name: null, url: null, altText: null, visibility: null }
                    : null,
            ogImage: ogImage.trim() || null,
        },
        comments: {
            enabled: siteCommentPolicy?.enabled !== false,
            moderationMode: siteCommentPolicy?.moderationMode || 'manual',
            allowReplies: siteCommentPolicy?.allowReplies !== false,
            requireEmail: Boolean(siteCommentPolicy?.requireEmail),
            total: commentMetrics.total,
            loaded: commentMetrics.loaded,
            pending: commentMetrics.pending,
            approved: commentMetrics.approved,
            reported: commentMetrics.reported,
            spam: commentMetrics.spam,
            blocked: commentMetrics.blocked,
            flagged: flaggedCommentCount,
            moderated: commentsModerated,
            error: commentError,
            publicThreadUrl: publicPostCommentsUrl,
            moderationUrl: moderationCommentsUrl,
        },
        readiness: {
            statusLabel: postReadiness?.statusLabel || null,
            score: postReadiness?.score ?? null,
            localScore: blogEditorReadiness.score,
            blockingFindings: readinessFindings.map((finding) => ({
                id: finding.id,
                severity: finding.severity,
                message: finding.message,
            })),
            localChecks: localReadinessChecks.map((check) => ({
                label: check.label,
                complete: check.complete,
            })),
        },
        actions: {
            save: {
                allowed: canEditBlog && canSave && !isUsingLocalPostCopy && !((status === 'published' || status === 'scheduled') && !canPublishBlog),
                disabledReason: saveDisabledReason,
            },
            preview: {
                allowed: canPublishBlog && !editorHasUnsavedChanges && !isUsingLocalPostCopy,
                disabledReason: previewWorkflowDisabledReason,
            },
            publish: {
                allowed: canPublishBlog && status !== 'published' && !editorHasUnsavedChanges && !isUsingLocalPostCopy && !routeBlocked && interactivePublishReady && !readinessBlocked,
                disabledReason: publishWorkflowDisabledReason,
            },
            archive: {
                allowed: canEditBlog && status !== 'archived' && !editorHasUnsavedChanges && !isUsingLocalPostCopy,
                disabledReason: archiveWorkflowDisabledReason,
            },
        },
        privacy: {
            includesCanvasContent: false,
            includesPrivateComments: false,
            includesRawCommentContent: false,
            includesCommentModerationEndpoint: true,
            note: 'This impact handoff exposes route, taxonomy, media, comment counts, readiness, and action safety metadata only.',
        },
    };
    const blogPublishImpactText = JSON.stringify(blogPublishImpact, null, 2);
    const newsletterIssueHandoff = {
        schemaVersion: 'backy.blog-newsletter-issue-source.v1',
        generatedAt: new Date().toISOString(),
        sourcePost: {
            id: post.id,
            title: title || post.title,
            slug: normalizedSlug || post.slug,
            path: publicPath,
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
            excerpt,
            author: selectedAuthor
                ? { id: selectedAuthor.id, name: selectedAuthor.name }
                : { id: selectedAuthorId, name: selectedAuthorId },
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
            featuredImageId,
        },
        newsletterWorkspace: {
            route: '/newsletter',
            siteId: activeSiteId,
            focusPanel: 'newsletter-issue-handoff',
            copyAction: 'newsletter-copy-issue-handoff',
        },
        endpoints: {
            publicPostBySlug: publicPostBySlugUrl,
            publicRender: publicRenderUrl,
            publicResolve: publicResolveUrl,
            sendReadySubscribers: newsletterSendableSubscribersUrl,
            heldSubscribers: newsletterHeldSubscribersUrl,
            contactSyncTemplate: newsletterContactSyncUrl,
        },
        issueReadiness: {
            published: status === 'published',
            routeReady: routeAvailability.status === 'available',
            featuredImageReady: Boolean(selectedFeaturedImage || !featuredImageId),
            blockingFindings: readinessFindings.map((finding) => ({
                id: finding.id,
                severity: finding.severity,
                message: finding.message,
            })),
        },
        providerBoundary: {
            externalDeliveryRequired: true,
            keepsProviderSecretsOutOfPayload: true,
            excludedSecrets: ['provider API keys', 'SMTP credentials', 'bounce webhook secrets', 'mailbox credentials'],
            note: 'Use Backy for post/source content, subscriber state, consent, and sync URLs. Use a mail provider for bulk delivery, bounces, complaints, unsubscribe enforcement, SPF/DKIM/DMARC, and sender reputation.',
        },
    };
    const newsletterIssueHandoffText = JSON.stringify(newsletterIssueHandoff, null, 2);
    const editorHandoff = {
        generatedAt: new Date().toISOString(),
        post: {
            id: post.id,
            title: title || post.title,
            slug: normalizedSlug || post.slug,
            path: publicPath,
            status,
            scheduledAt: status === 'scheduled' ? scheduledAt : null,
            excerpt,
            featuredImageId,
        },
        route: {
            path: publicPath,
            slug: normalizedSlug || post.slug,
            canonical: normalizedCanonicalPath,
            availability: routeAvailability,
        },
        seo: {
            title: seoTitle.trim() || title,
            description: seoDescription.trim() || excerpt,
            canonical: normalizedCanonicalPath,
            ogImage: ogImage.trim() || null,
            featuredImage: selectedFeaturedImage
                ? {
                    id: selectedFeaturedImage.id,
                    name: selectedFeaturedImage.name,
                    url: selectedFeaturedImageUrl,
                    altText: selectedFeaturedImage.altText || null,
                    responsive: selectedFeaturedImage.responsive || null,
                }
                : featuredImageId
                    ? { id: featuredImageId, name: null, url: null, altText: null, responsive: null }
                    : null,
            robots: {
                index: !noIndex,
                follow: !noFollow,
            },
        },
        site: {
            id: activeSiteId,
            name: selectedSite?.name || activeSiteId,
            slug: selectedSite?.slug || activeSiteId,
        },
        endpoints: {
            readUpdateDelete: adminBlogPostUrl,
            revisions: `${adminBlogPostUrl}/revisions`,
            readiness: `${adminBlogPostUrl}/readiness`,
            preview: `${adminBlogPostUrl}/preview`,
            publish: `${adminBlogPostUrl}/publish`,
            archive: `${adminBlogPostUrl}/archive`,
            rollback: `${adminBlogPostUrl}/rollback`,
            rollbackMethod: 'POST',
            rollbackBody: { revisionId: '{revisionId}' },
            publicBlog: publicBlogUrl,
            publicPostBySlug: publicPostBySlugUrl,
            publicRender: publicRenderUrl,
            publicResolve: publicResolveUrl,
            publicComments: publicPostCommentsUrl,
            moderationComments: moderationCommentsUrl,
        },
        editorial: {
            author: selectedAuthor
                ? { id: selectedAuthor.id, name: selectedAuthor.name }
                : { id: selectedAuthorId, name: selectedAuthorId },
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
            categories: selectedCategories,
            tags: selectedTags,
        },
        comments: {
            total: commentMetrics.total,
            loaded: commentMetrics.loaded,
            pending: commentMetrics.pending,
            approved: commentMetrics.approved,
            rejected: commentMetrics.rejected,
            spam: commentMetrics.spam,
            blocked: commentMetrics.blocked,
            reported: commentMetrics.reported,
            latest: postComments.slice(0, 5).map((comment) => ({
                id: comment.id,
                status: comment.status,
                authorName: comment.authorName || null,
                reportCount: comment.reportCount || 0,
                createdAt: comment.createdAt,
                reviewedAt: comment.reviewedAt || null,
            })),
        },
        canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            rootLayerCount: canvasElements.length,
            mediaContext: {
                siteId: activeSiteId,
                scope: 'post',
                targetId: postId,
            },
        },
        design: {
            schemaVersion: 'backy.custom-frontend-design-envelope.v1',
            source: savedContentDocument ? 'stored-content-document' : 'normalized-editor-canvas',
            contentDocumentSummary: {
                id: currentDesignDocument.id,
                kind: currentDesignDocument.kind,
                schemaVersion: currentDesignDocument.schemaVersion,
                status: currentDesignDocument.status || status,
                slug: currentDesignDocument.slug || normalizedSlug || post.slug,
            },
            contentDocument: currentDesignDocument,
            elements: canvasElements,
            canvasSize,
            customCSS: savedCustomCSS || '',
            customJS: savedCustomJS || '',
            customCSSPresent: Boolean(savedCustomCSS?.trim()),
            customJSPresent: Boolean(savedCustomJS?.trim()),
            themeTokenRefCount: recordKeyCount(currentDesignDocument.themeTokenRefs),
            assetCount: arrayCount(currentDesignDocument.assets?.media) + arrayCount(currentDesignDocument.assets?.fonts),
            animationTimelineCount: arrayCount(currentDesignDocument.metadata?.animations),
            interactionGroupCount: recordKeyCount(currentDesignDocument.interactions),
            dataBindingDatasetCount: arrayCount(currentDesignDocument.dataBindings?.datasets),
            dataBindingCount: arrayCount(currentDesignDocument.dataBindings?.bindings),
            editableFieldCount: recordKeyCount(currentDesignDocument.editableMap),
            metadata: currentDesignDocument.metadata || {},
            editorComposition: currentDesignDocument.metadata?.editorComposition || null,
        },
        template: hasFrontendDesignTemplate
            ? {
                id: frontendDesignTemplate.id,
                name: frontendDesignTemplate.name || frontendDesignTemplate.id,
                routePattern: frontendDesignTemplate.routePattern || publicPath,
                source: frontendDesignTemplate.source,
                chrome: frontendDesignTemplate.chrome,
                tokens: frontendDesignTemplate.tokens,
                customCss: frontendDesignTemplate.customCss || null,
                bindingHints: frontendDesignTemplate.bindingHints,
            }
            : {
                id: 'backy-blog-editor',
                name: 'Backy blog editor canvas',
                routePattern: '/blog/{slug}',
                source: 'backy-managed',
                bindingHints: [],
            },
        editorCapabilities: [
            'Edit blog metadata, route, status, taxonomy, and SEO summary beside the public canvas.',
            'Drag, resize, select unlocked siblings with Cmd/Ctrl+A, group with Cmd/Ctrl+G, ungroup, layer, save reusable selections, and bind media-ready components.',
            'Use blog workspace focus to hide editorial and publish panels while designing large article canvases.',
            'Persist serialized canvas content, settings, taxonomy, and revision metadata through the blog update endpoint.',
            'Generate preview links before publishing route changes.',
            'Restore backend revisions when a public article design needs rollback.',
        ],
        readiness: {
            score: blogEditorReadiness.score,
            checks: blogEditorReadiness.checks,
            backend: postReadiness
                ? {
                    score: postReadiness.score,
                    statusLabel: postReadiness.statusLabel,
                    elementCount: postReadiness.elementCount,
                    canvasSize: postReadiness.canvasSize,
                }
                : null,
        },
        publishImpact: blogPublishImpact,
        newsletterIssue: newsletterIssueHandoff,
        revisions: revisions.map((revision) => ({
            id: revision.id,
            note: revision.note,
            parentRevisionId: revision.parentRevisionId,
            operation: revision.operation,
            restoreTargetRevisionId: revision.restoreTargetRevisionId,
            metadata: revision.metadata,
            createdAt: revision.createdAt,
            createdBy: revision.createdBy,
            actor: getContentRevisionActorLabel(revision),
            action: getContentRevisionActionLabel(revision),
            status: revision.snapshotStatus,
            graph: blogRevisionTimelineById.get(revision.id),
            snapshot: {
                title: revision.snapshotTitle,
                slug: revision.snapshotSlug,
                updatedAt: revision.snapshotUpdatedAt,
                excerpt: revision.snapshotExcerpt,
                authorId: revision.snapshotAuthorId,
                featuredImageId: revision.snapshotFeaturedImageId,
                categoryIds: revision.snapshotCategoryIds,
                tagIds: revision.snapshotTagIds,
                canvas: revision.snapshotCanvas,
            },
            compareToCurrent: revisionDiffById.get(revision.id),
        })),
        revisionGraph: {
            schema: 'backy.blog-revision-graph.v1',
            total: blogRevisionTimeline.length,
            order: 'newest-first',
            collapsedCount: BLOG_REVISION_COLLAPSED_COUNT,
            nodes: blogRevisionTimeline,
            branchGraph: blogRevisionBranchGraph,
        },
        preview: previewUrl
            ? {
                url: previewUrl,
                expiresAt: previewExpiresAt,
            }
            : null,
        guardrails: [
            'Publish is blocked when backend readiness reports blocking errors.',
            'Canonical paths are stored on post meta and drive hosted route SEO, sitemap discovery, resolve payloads, and custom frontend render contracts.',
            'Saving records a revision snapshot before editor changes are persisted.',
            'Frontend renderers should use public blog, resolve, or render endpoints and keep admin endpoints private.',
            'Taxonomy IDs are site-scoped and should be refreshed before rendering filters, feeds, or bylines.',
            'Public frontends should serve approved comments only; moderation state is private and available through the site comments endpoint.',
        ],
    };
    const editorHandoffText = JSON.stringify(editorHandoff, null, 2);
    const newsletterIssueDraftText = newsletterIssueDraft
        ? JSON.stringify(newsletterIssueDraft, null, 2)
        : '';

    const handleBuildNewsletterIssueDraft = async () => {
        if (!post || blogEditorNewsletterIssueDraftDisabledReason) return;

        setIsBuildingNewsletterIssueDraft(true);
        setNewsletterIssueDraftError(null);
        setWorkflowNotice(null);
        setSaveWarning(null);
        try {
            const handoff = await buildNewsletterIssueDraft(activeSiteId, {
                postId: post.id,
                audience: 'sendable',
                recipientLimit: 100,
                subjectOverride: title.trim() || post.title,
                preheaderOverride: excerpt.trim() || post.excerpt || null,
            });
            setNewsletterIssueDraft(handoff);
            setWorkflowNotice(
                `Newsletter issue draft ${handoff.issueDraft.id} built for ${handoff.issueDraft.audience.selectedRecipientCount} send-ready subscriber${handoff.issueDraft.audience.selectedRecipientCount === 1 ? '' : 's'}.`,
            );
        } catch (issueError) {
            setNewsletterIssueDraft(null);
            setNewsletterIssueDraftError(issueError instanceof Error ? issueError.message : 'Unable to build newsletter issue draft.');
        } finally {
            setIsBuildingNewsletterIssueDraft(false);
        }
    };

    const copyEditorHandoffText = async (value: string, label: string) => {
        if (editorCommandBusy) return;
        if (!canViewBlog) {
            setSaveWarning(viewBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        try {
            await navigator.clipboard.writeText(value);
            setSaveWarning(null);
            setWorkflowNotice(`${label} copied.`);
        } catch {
            setWorkflowNotice(null);
            setSaveWarning(value);
        }
    };

    const downloadEditorHandoff = () => {
        if (editorCommandBusy) return;
        if (!canViewBlog) {
            setSaveWarning(viewBlogDeniedMessage);
            setWorkflowNotice(null);
            return;
        }

        const blob = new Blob([editorHandoffText], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${slug || post.slug || post.id}-backy-blog-editor-handoff.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setSaveWarning(null);
        setWorkflowNotice('Blog editor handoff manifest downloaded.');
    };

    const blogRevisionCompareBrief = (revision: ContentRevision) => ({
        schema: 'backy.blog-revision-compare.v1',
        generatedAt: new Date().toISOString(),
        post: {
            id: post.id,
            title: title || post.title,
            slug: normalizedSlug || post.slug,
            path: publicPath,
            status,
            excerpt,
            featuredImageId,
            authorId: selectedAuthorId,
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
        },
        revision: {
            id: revision.id,
            note: revision.note,
            parentRevisionId: revision.parentRevisionId,
            operation: revision.operation,
            restoreTargetRevisionId: revision.restoreTargetRevisionId,
            metadata: revision.metadata,
            createdAt: revision.createdAt,
            createdBy: revision.createdBy,
            actor: getContentRevisionActorLabel(revision),
            action: getContentRevisionActionLabel(revision),
            graph: blogRevisionTimelineById.get(revision.id) || null,
            snapshot: {
                title: revision.snapshotTitle,
                slug: revision.snapshotSlug,
                status: revision.snapshotStatus,
                updatedAt: revision.snapshotUpdatedAt,
                excerpt: revision.snapshotExcerpt,
                authorId: revision.snapshotAuthorId,
                featuredImageId: revision.snapshotFeaturedImageId,
                categoryIds: revision.snapshotCategoryIds,
                tagIds: revision.snapshotTagIds,
                metaTitle: revision.snapshotMetaTitle,
                metaDescription: revision.snapshotMetaDescription,
                canvas: revision.snapshotCanvas,
            },
        },
        current: {
            title,
            slug: normalizedSlug || post.slug,
            status,
            excerpt,
            seoTitle,
            seoDescription,
            featuredImageId,
            authorId: selectedAuthorId,
            categoryIds: selectedCategoryIds,
            tagIds: selectedTagIds,
            canvas: {
                width: canvasSize.width,
                height: canvasSize.height,
                rootLayerCount: canvasTreeStats.rootLayerCount,
                totalLayerCount: canvasTreeStats.totalLayerCount,
                containerLayerCount: canvasTreeStats.containerLayerCount,
                maxDepth: canvasTreeStats.maxDepth,
            },
        },
        compareToCurrent: revisionDiffById.get(revision.id) || null,
        endpoints: {
            revisions: `${adminBlogPostUrl}/revisions`,
            rollback: `${adminBlogPostUrl}/rollback`,
            rollbackMethod: 'POST',
            rollbackBody: { revisionId: revision.id },
        },
    });

    const copyBlogRevisionCompare = async (revision: ContentRevision) => {
        await copyEditorHandoffText(JSON.stringify(blogRevisionCompareBrief(revision), null, 2), 'Blog revision comparison');
    };
    const pendingRestoreRevisionDiff = pendingRestoreRevision
        ? revisionDiffById.get(pendingRestoreRevision.id) || null
        : null;
    const pendingRestoreRevisionGraphNode = pendingRestoreRevision
        ? blogRevisionTimelineById.get(pendingRestoreRevision.id) || null
        : null;

    return (
        <PageShell
            title={
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => navigate({ to: '/blog', search: { siteId: activeSiteId } })}
                        disabled={editorBusy}
                        className="rounded-lg border border-border bg-background p-2 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label="Back to blog"
                        aria-describedby={blogEditorCommandActionStatusId}
                        data-testid="blog-editor-back-to-blog"
                        data-action-state={blogEditorBackDisabledReason ? 'blocked' : 'ready'}
                        data-action-status={blogEditorBackActionStatus}
                        data-disabled-reason={blogEditorBackDisabledReason || undefined}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span>Edit Blog Post</span>
                </div>
            }
            description="Edit the article, its publishing state, and its public design in one workspace."
            className={cn(
                isWorkspaceFocus
                    ? 'h-[calc(100vh-1rem)] overflow-hidden lg:h-[calc(100vh-1.5rem)]'
                    : undefined,
            )}
            contentClassName={isWorkspaceFocus ? 'h-full min-h-0' : 'flex flex-col gap-5'}
            hideHeader={isWorkspaceFocus}
            action={
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => setWorkspaceFocusRoute(!isWorkspaceFocus)}
                    disabled={workspaceFocusDisabled}
                    iconStart={isWorkspaceFocus ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                    aria-describedby={blogEditorCommandActionStatusId}
                    data-testid="blog-editor-focus-toggle"
                    data-action-state={blogEditorFocusDisabledReason ? 'blocked' : 'ready'}
                    data-action-status={blogEditorFocusActionStatus}
                    data-disabled-reason={blogEditorFocusDisabledReason || undefined}
                >
                    {isWorkspaceFocus ? 'Show blog panels' : 'Focus canvas'}
                </Button>
            }
        >
            <div className={cn(
                'w-full',
                isWorkspaceFocus ? 'h-full min-h-0 overflow-hidden pb-0' : 'flex flex-col gap-5 pb-24',
            )}>
                {(loadError || saveWarning || routeCheckError) && (
                    <Notice tone="warning" className="mb-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{saveWarning || routeCheckError || `${loadError} Using the local post copy in read-only mode.`}</span>
                            {routeCheckError && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={editorRouteCheckBusy}
                                    onClick={retryRouteCheck}
                                    iconStart={<RefreshCw className={cn('size-3.5', isCheckingRoutes && 'animate-spin')} />}
                                >
                                    Retry route check
                                </Button>
                            )}
                            {(loadError || saveConflict) && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={editorActionBusy}
                                    onClick={() => void reloadLatestPost()}
                                    iconStart={<RefreshCw className={cn('size-3.5', isLoadingPost && 'animate-spin')} />}
                                >
                                    Reload latest
                                </Button>
                            )}
                        </div>
                        {saveConflict && (
                            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                                <div>
                                    <dt className="font-medium">Editor loaded</dt>
                                    <dd className="font-mono">{saveConflict.expectedUpdatedAt || 'unknown'}</dd>
                                </div>
                                <div>
                                    <dt className="font-medium">Backend latest</dt>
                                    <dd className="font-mono">{saveConflict.currentUpdatedAt || 'unknown'}</dd>
                                </div>
                            </dl>
                        )}
                    </Notice>
                )}
                {(permissionError || isPermissionMatrixPending) && (
                    <Notice
                        tone="warning"
                        title={isPermissionMatrixPending ? 'Syncing blog editor permissions' : 'Blog editor permissions could not be verified'}
                        className="mb-4"
                        role={permissionError ? 'alert' : 'status'}
                        data-testid="blog-editor-permission-state"
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span>{isPermissionMatrixPending ? 'Role-default access keeps the editor usable while backend permission details load.' : permissionError}</span>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={loadBlogEditorPermissions}
                                    disabled={isPermissionsLoading}
                                    aria-label="Retry loading blog editor permissions"
                                    iconStart={<RefreshCw className={cn('size-3.5', isPermissionsLoading && 'animate-spin')} />}
                                >
                                    Retry permissions
                                </Button>
                                <Link
                                    to="/users"
                                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-ring"
                                >
                                    Review users
                                </Link>
                            </div>
                        </div>
                    </Notice>
                )}
                {workflowNotice && (
                    <Notice tone="success" className="mb-4">
                        {workflowNotice}
                    </Notice>
                )}

                {!isWorkspaceFocus && (
                <section
                    className="order-2 rounded-lg border border-border bg-card p-5 shadow-sm"
                    data-testid="blog-editor-command-center"
                    data-default-editor-order="after-canvas"
                    aria-describedby={blogEditorCommandActionStatusId}
                    data-action-state={editorCommandBusy ? 'busy' : 'ready'}
                    data-action-status={blogEditorCommandActionStatus}
                >
                    <span id={blogEditorCommandActionStatusId} className="sr-only" data-testid="blog-editor-command-action-status" aria-live="polite">
                        {blogEditorCommandActionStatus}
                    </span>
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold text-foreground">Blog editor command center</h2>
                                <span className={cn(
                                    'rounded-full px-2.5 py-1 text-xs font-semibold',
                                    blogEditorReadiness.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                                )}
                                >
                                    {blogEditorReadiness.score}% ready
                                </span>
                                <StatusBadge status={status} />
                            </div>
                            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                                Control the article draft, canvas design, taxonomy, publishing workflow, readiness blockers, preview links, and revision rollback from one workspace.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
                                disabled={editorCommandBusy || !canViewBlog}
                                title={blogEditorHandoffDisabledReason || undefined}
                                iconStart={<Copy className="size-4" />}
                                aria-describedby={blogEditorCommandActionStatusId}
                                data-testid="blog-editor-copy-handoff"
                                data-action-state={blogEditorHandoffDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
                                data-action-status={blogEditorHandoffActionStatus}
                                data-disabled-reason={blogEditorHandoffDisabledReason || undefined}
                            >
                                Copy handoff
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={downloadEditorHandoff}
                                disabled={editorCommandBusy || !canViewBlog}
                                title={blogEditorHandoffDisabledReason || undefined}
                                iconStart={<Download className="size-4" />}
                                aria-describedby={blogEditorCommandActionStatusId}
                                data-testid="blog-editor-download-handoff"
                                data-action-state={blogEditorHandoffDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
                                data-action-status={blogEditorHandoffActionStatus}
                                data-disabled-reason={blogEditorHandoffDisabledReason || undefined}
                            >
                                Download JSON
                            </Button>
                            <Button
                                type="submit"
                                form="blog-editor-form"
                                disabled={saveActionBusy || isUsingLocalPostCopy || !canSave || !canEditBlog || ((status === 'published' || status === 'scheduled') && !canPublishBlog)}
                                title={blogEditorSaveDisabledReason || undefined}
                                variant="primary"
                                iconStart={<Save className="size-4" />}
                                aria-describedby={blogEditorCommandActionStatusId}
                                data-testid="blog-editor-save"
                                data-action-state={blogEditorSaveDisabledReason ? saveActionBusy ? 'busy' : 'blocked' : 'ready'}
                                data-action-status={blogEditorSaveActionStatus}
                                data-disabled-reason={blogEditorSaveDisabledReason || undefined}
                            >
                                {isLoading ? 'Saving...' : submitLabel}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void generatePreview()}
                                disabled={editorPreviewBusy || isUsingLocalPostCopy || !canPublishBlog}
                                title={blogEditorPreviewDisabledReason || undefined}
                                iconStart={<Eye className="size-4" />}
                                aria-describedby={blogEditorCommandActionStatusId}
                                data-testid="blog-editor-preview"
                                data-action-state={blogEditorPreviewDisabledReason ? editorPreviewBusy ? 'busy' : 'blocked' : 'ready'}
                                data-action-status={blogEditorPreviewActionStatus}
                                data-disabled-reason={blogEditorPreviewDisabledReason || undefined}
                            >
                                Preview
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void refreshPostReadiness()}
                                disabled={editorReadinessBusy || !canViewBlog}
                                title={blogEditorReadinessDisabledReason || undefined}
                                iconStart={<RefreshCw className={cn('size-4', readinessLoading && 'animate-spin')} />}
                                aria-describedby={blogEditorCommandActionStatusId}
                                data-testid="blog-editor-refresh-readiness"
                                data-action-state={blogEditorReadinessDisabledReason ? editorReadinessBusy ? 'busy' : 'blocked' : 'ready'}
                                data-action-status={blogEditorReadinessActionStatus}
                                data-disabled-reason={blogEditorReadinessDisabledReason || undefined}
                            >
                                Refresh readiness
                            </Button>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                        <div className="rounded-lg border border-border bg-background p-4">
                            <h3 className="text-sm font-semibold">Post readiness</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Checks title, route, excerpt, canvas content, schedule state, backend readiness, and restore safety.
                            </p>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                    className={cn('h-full rounded-full', blogEditorReadiness.score >= 80 ? 'bg-emerald-500' : 'bg-amber-500')}
                                    style={{ width: `${blogEditorReadiness.score}%` }}
                                />
                            </div>
                            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {blogEditorReadiness.checks.map((check) => (
                                    <BlogEditorReadinessCheck key={check.label} {...check} />
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-border bg-background p-4">
                            <div className="flex items-center gap-2">
                                <PenLine className="size-4 text-primary" />
                                <h3 className="text-sm font-semibold">Article workflow</h3>
                            </div>
                            <div className="mt-3 grid gap-2">
                                {blogEditorReadiness.workflow.map((step, index) => (
                                    <BlogEditorWorkflowStep key={step.label} index={index + 1} {...step} />
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-border bg-background p-4">
                        <h3 className="text-sm font-semibold">Blog editor control map</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Jump to draft fields, the canvas, publish controls, taxonomy, revisions, and frontend handoff.</p>
                        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                            {BLOG_EDITOR_CONTROL_AREAS.map((area) => (
                                <a
                                    key={area.title}
                                    href={area.href}
                                    className="rounded-lg border border-border bg-card px-3 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"
                                >
                                    <div className="text-sm font-semibold text-foreground">{area.title}</div>
                                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{area.detail}</div>
                                </a>
                            ))}
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-5">
                            <BlogEditorMetaTile label="Route" value={normalizedSlug ? publicPath : 'No slug'} />
                            <BlogEditorMetaTile label="Canonical" value={normalizedCanonicalPath} />
                            <BlogEditorMetaTile label="Image" value={selectedFeaturedImage?.name || (featuredImageId ? 'Selected' : 'None')} />
                            <BlogEditorMetaTile label="Canvas" value={`${canvasSize.width} x ${canvasSize.height}px`} />
                            <BlogEditorMetaTile label="Status" value={status} />
                        </div>
                        <div
                            className="mt-4 rounded-lg border border-teal-200 bg-teal-50/60 p-4"
                            data-testid="blog-editor-template-provenance"
                            data-template-id={hasFrontendDesignTemplate ? frontendDesignTemplate.id : ''}
                        >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold text-teal-950">Template-backed article page</h3>
                                    <p className="mt-1 text-sm leading-6 text-teal-900/80">
                                        {hasFrontendDesignTemplate
                                            ? 'This post keeps the frontend design template, route pattern, chrome, tokens, and editable binding hints in the editor handoff.'
                                            : 'This post uses the Backy-managed article canvas and can still be captured into a frontend design template later.'}
                                    </p>
                                </div>
                                <StatusBadge status={hasFrontendDesignTemplate ? 'template linked' : 'backy canvas'} />
                            </div>
                            <div className="mt-4 grid gap-3 md:grid-cols-4">
                                <BlogEditorMetaTile label="Template" value={frontendDesignTemplate.name || frontendDesignTemplate.id || 'Backy blog editor'} />
                                <BlogEditorMetaTile label="Template ID" value={frontendDesignTemplate.id || 'none'} />
                                <BlogEditorMetaTile label="Route pattern" value={frontendDesignTemplate.routePattern || '/blog/{slug}'} />
                                <BlogEditorMetaTile label="Bindings" value={`${frontendDesignTemplate.bindingHints.length} hint${frontendDesignTemplate.bindingHints.length === 1 ? '' : 's'}`} />
                            </div>
                        </div>
                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void copyEditorHandoffText(adminBlogPostUrl, 'Blog editor API URL')}
                                        disabled={editorCommandBusy || !canViewBlog}
                                        title={blogEditorHandoffDisabledReason || undefined}
                                        iconStart={<Copy className="size-4" />}
                                        aria-describedby={blogEditorCommandActionStatusId}
                                        data-testid="blog-editor-copy-api-url"
                                        data-action-state={blogEditorHandoffDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
                                        data-action-status={blogEditorHandoffActionStatus}
                                        data-disabled-reason={blogEditorHandoffDisabledReason || undefined}
                                    >
                                        Copy API URL
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
                                        disabled={editorCommandBusy || !canViewBlog}
                                        title={blogEditorHandoffDisabledReason || undefined}
                                        iconStart={<Copy className="size-4" />}
                                        aria-describedby={blogEditorCommandActionStatusId}
                                        data-testid="blog-editor-control-map-copy-handoff"
                                        data-action-state={blogEditorHandoffDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
                                        data-action-status={blogEditorHandoffActionStatus}
                                        data-disabled-reason={blogEditorHandoffDisabledReason || undefined}
                                    >
                                        Copy handoff
                                    </Button>
                        </div>
                    </div>
                </section>
                )}

                <form
                    id="blog-editor-form"
                    onSubmit={handleSubmit}
                    className={cn(
                        'grid gap-5',
                        isWorkspaceFocus && 'h-full min-h-0',
                        !isWorkspaceFocus && 'order-1',
                    )}
                    data-testid="blog-editor-workspace-grid"
                    data-default-editor-order={isWorkspaceFocus ? 'focused-canvas' : 'canvas-first'}
                    data-editor-management-layout={isWorkspaceFocus ? 'hidden' : 'below-canvas'}
                >
                    <div className={cn(
                        'min-w-0',
                        isWorkspaceFocus ? 'h-full min-h-0 space-y-0' : 'flex flex-col gap-6',
                    )}>
                        {!isWorkspaceFocus && (
                        <Panel id="blog-editor-draft" className="order-2 overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="Editorial draft"
                                description="Title, canonical URL, and list/SEO summary."
                                icon={<PenLine className="size-4" />}
                                action={<StatusBadge status={status} />}
                            />
                            <PanelContent className="space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Post title</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setTitle(e.target.value);
                                        }}
                                        placeholder="Untitled post"
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full rounded-lg border-0 bg-transparent px-0 text-4xl font-semibold tracking-normal placeholder:text-muted-foreground/45 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                                    <span className="font-mono text-muted-foreground">/blog/</span>
                                    <input
                                        type="text"
                                        value={slug}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setSlug(slugify(e.target.value));
                                        }}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="min-w-48 flex-1 border-0 bg-transparent p-0 font-mono text-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="post-slug"
                                    />
                                </div>
                                {(routeConflict || routeCheckError) && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            <span>
                                                {routeCheckError
                                                    ? 'Backy could not verify existing blog routes for this site. Retry before saving or publishing.'
                                                    : `${publicPath} is already used by "${routeConflict?.title}". Choose another slug or edit that post first.`}
                                            </span>
                                            {routeCheckError && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={editorRouteCheckBusy}
                                                    onClick={retryRouteCheck}
                                                    iconStart={<RefreshCw className={cn('size-3.5', isCheckingRoutes && 'animate-spin')} />}
                                                >
                                                    Retry
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Excerpt</label>
                                    <textarea
                                        value={excerpt}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setExcerpt(e.target.value);
                                        }}
                                        rows={3}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="Short summary for blog lists, feeds, and SEO previews."
                                    />
                                    <div className="text-xs text-muted-foreground">{excerpt.length} characters</div>
                                </div>
                            </PanelContent>
                        </Panel>
                        )}

                        {!isWorkspaceFocus && (
                        <Panel id="blog-editor-seo" className="order-3 overflow-hidden scroll-mt-24">
                            <PanelHeader
                                title="SEO and discovery"
                                description="Search metadata, canonical path, Open Graph image, and robots controls for hosted pages and external frontends."
                                icon={<SearchCheck className="size-4" />}
                            />
                            <PanelContent className="space-y-5">
                                <div className="grid gap-4 xl:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Search title</label>
                                        <input
                                            type="text"
                                            value={seoTitle}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setSeoTitle(e.target.value);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={title || 'Search result title'}
                                        />
                                        <div className="text-xs text-muted-foreground">{seoTitle.trim().length || title.length} characters</div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Canonical path</label>
                                        <input
                                            type="text"
                                            value={canonicalPath}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setCanonicalPath(e.target.value);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            placeholder={publicPath}
                                        />
                                        <div className="text-xs text-muted-foreground">{normalizedCanonicalPath}</div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Search description</label>
                                    <textarea
                                        value={seoDescription}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setSeoDescription(e.target.value);
                                        }}
                                        rows={3}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full resize-none rounded-lg border bg-background px-4 py-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder={excerpt || 'Describe the article for search, social previews, feeds, and generated frontends.'}
                                    />
                                    <div className={cn('text-xs', seoDescription.trim().length >= 50 ? 'text-muted-foreground' : 'text-amber-700')}>
                                        {seoDescription.trim().length || excerpt.length} characters. Aim for at least 50.
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Open Graph image URL</label>
                                    <input
                                        type="url"
                                        value={ogImage}
                                        onChange={(e) => {
                                            clearEditorFeedback();
                                            setOgImage(e.target.value);
                                        }}
                                        disabled={editorFormDisabled}
                                        title={editBlogPermissionTitle}
                                        className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                        placeholder="https://..."
                                    />
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={noIndex}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setNoIndex(e.target.checked);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">No index</span>
                                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask crawlers to keep this post out of search indexes.</span>
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 rounded-lg border border-border bg-background px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={noFollow}
                                            onChange={(e) => {
                                                clearEditorFeedback();
                                                setNoFollow(e.target.checked);
                                            }}
                                            disabled={editorFormDisabled}
                                            title={editBlogPermissionTitle}
                                            className="mt-1"
                                        />
                                        <span>
                                            <span className="block text-sm font-medium text-foreground">No follow</span>
                                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">Ask crawlers not to follow links from this post.</span>
                                        </span>
                                    </label>
                                </div>
                            </PanelContent>
                        </Panel>
                        )}

                        <div
                            id="blog-editor-canvas"
                            className={cn(
                                'min-w-0 scroll-mt-24',
                                isWorkspaceFocus ? 'h-full min-h-0' : 'order-1',
                            )}
                            data-testid="blog-editor-canvas-shell"
                            data-default-editor-order={isWorkspaceFocus ? 'focused-canvas' : 'canvas-first'}
                        >
                            <EditorWorkspaceFrame
                                title={isWorkspaceFocus ? 'Post canvas' : 'Post design canvas'}
                                description={isWorkspaceFocus
                                    ? 'Focused article design workspace with the same component, layer, media, grouping, and data-binding controls used by pages.'
                                    : 'Design the public post page with the same component, layer, media, grouping, and data-binding controls used by pages.'}
                                meta={
                                    <>
                                        <span className="rounded bg-muted px-2 py-1 tabular-nums">
                                            {canvasSize.width} x {canvasSize.height}px
                                        </span>
                                        <span className="rounded bg-muted px-2 py-1">
                                            {canvasElements.length} root layer{canvasElements.length === 1 ? '' : 's'}
                                        </span>
                                        {hasFrontendDesignTemplate && (
                                            <span className="rounded bg-teal-50 px-2 py-1 font-medium text-teal-700">
                                                Template: {frontendDesignTemplate.name || frontendDesignTemplate.id}
                                            </span>
                                        )}
                                        {isWorkspaceFocus && (
                                            <span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary">
                                                Focused
                                            </span>
                                        )}
                                    </>
                                }
                                actions={isWorkspaceFocus ? (
                                    <>
                                        <Button
                                            type="submit"
                                            form="blog-editor-form"
                                            disabled={saveActionBusy || isUsingLocalPostCopy || !canSave || !canEditBlog || ((status === 'published' || status === 'scheduled') && !canPublishBlog)}
                                            size="sm"
                                            iconStart={<Save className="size-4" />}
                                            data-testid="blog-editor-canvas-save"
                                            data-action-state={blogEditorSaveDisabledReason ? saveActionBusy ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorSaveActionStatus}
                                            data-disabled-reason={blogEditorSaveDisabledReason || undefined}
                                        >
                                            {isLoading ? 'Saving...' : submitLabel}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkspaceFocusRoute(false)}
                                            disabled={workspaceFocusDisabled}
                                            iconStart={<Minimize2 className="size-4" />}
                                            data-testid="blog-editor-focus-banner-show-panels"
                                            data-action-state={blogEditorFocusDisabledReason ? 'blocked' : 'ready'}
                                            data-action-status={blogEditorFocusActionStatus}
                                            data-disabled-reason={blogEditorFocusDisabledReason || undefined}
                                        >
                                            Show panels
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button
                                            type="submit"
                                            form="blog-editor-form"
                                            disabled={saveActionBusy || isUsingLocalPostCopy || !canSave || !canEditBlog || ((status === 'published' || status === 'scheduled') && !canPublishBlog)}
                                            title={blogEditorSaveDisabledReason || undefined}
                                            size="sm"
                                            iconStart={<Save className="size-4" />}
                                            data-testid="blog-editor-canvas-save"
                                            data-action-state={blogEditorSaveDisabledReason ? saveActionBusy ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorSaveActionStatus}
                                            data-disabled-reason={blogEditorSaveDisabledReason || undefined}
                                        >
                                            {isLoading ? 'Saving...' : submitLabel}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void generatePreview()}
                                            disabled={editorPreviewBusy || isUsingLocalPostCopy || !canPublishBlog}
                                            title={blogEditorPreviewDisabledReason || undefined}
                                            iconStart={<Eye className="size-4" />}
                                            data-testid="blog-editor-canvas-preview"
                                            data-action-state={blogEditorPreviewDisabledReason ? editorPreviewBusy ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorPreviewActionStatus}
                                            data-disabled-reason={blogEditorPreviewDisabledReason || undefined}
                                        >
                                            Preview
                                        </Button>
                                    </>
                                )}
                                density={isWorkspaceFocus ? 'compact' : 'default'}
                                data-testid={isWorkspaceFocus ? 'blog-editor-focus-banner' : undefined}
                                className={cn(
                                    'relative',
                                    isWorkspaceFocus
                                        ? 'h-full min-h-0'
                                        : 'min-h-[820px] xl:h-[calc(100vh-72px)] xl:min-h-[920px]',
                                )}
                            >
                                <CanvasEditor
                                    mode="blog"
                                    initialElements={initialElements}
                                    initialSettings={dummySettings}
                                    initialSize={canvasSize}
                                    initialSelectedElementId={routeSearch.elementId}
                                    initialCanvasFocusMode={isWorkspaceFocus}
                                    theme={selectedSite?.theme}
                                    onSave={() => { }}
                                    onChange={(elements, _settings, size) => {
                                        if (editorBusy || !canEditBlog || isUsingLocalPostCopy) return;
                                        clearEditorFeedback();
                                        setCanvasElements(elements);
                                        if (size) setCanvasSize(size);
                                    }}
                                    className="h-full w-full"
                                    hideNavigation={true}
                                    hideSettings={true}
                                    hideSave={true}
                                    savePersistence="parent"
                                    saveOwnerLabel="post form"
                                    saveOwnerVersion={post.updatedAt}
                                    canView={canViewBlog}
                                    canEdit={canEditBlog && !isUsingLocalPostCopy}
                                    canPublish={canPublishBlog && !isUsingLocalPostCopy}
                                    canViewMedia={canViewMedia}
                                    canCreateMedia={canCreateMedia}
                                    canViewCollections={canViewCollections}
                                    editDisabledReason={isUsingLocalPostCopy ? localPostCopyDisabledMessage : editBlogPermissionTitle}
                                    publishDisabledReason={isUsingLocalPostCopy ? localPostCopyDisabledMessage : publishBlogPermissionTitle}
                                    mediaViewDisabledReason={viewMediaDeniedMessage}
                                    mediaCreateDisabledReason={createMediaDeniedMessage}
                                    collectionsViewDisabledReason={viewCollectionsDeniedMessage}
                                    mediaContext={{
                                      siteId: activeSiteId,
                                      scope: 'post',
                                      targetId: postId,
                                      targetLabel: post.title,
                                    }}
                                />
                                {(editorBusy || !canEditBlog) && (
                                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 backdrop-blur-sm">
                                        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm">
                                            {isUsingLocalPostCopy ? 'Reload the backend post before editing.' : !canEditBlog ? 'Blog editing is disabled for this account.' : isLoading ? 'Saving post design...' : 'Updating post workflow...'}
                                        </div>
                                    </div>
                                )}
                            </EditorWorkspaceFrame>
                        </div>
                    </div>

                    {!isWorkspaceFocus && (
                    <aside
                        className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3"
                        data-testid="blog-editor-management-panels"
                        data-editor-management-layout="below-canvas"
                    >
                        <Panel id="blog-editor-publish" className="scroll-mt-24">
                            <PanelHeader
                                title="Publish"
                                description={selectedSite ? selectedSite.name : activeSiteId}
                                icon={<CalendarClock className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="grid grid-cols-4 gap-1 rounded-lg border border-border bg-muted p-1">
                                    {BLOG_EDITOR_STATUS_OPTIONS.map((nextStatus) => {
                                        const statusDisabledReason = getBlogEditorStatusDisabledReason(nextStatus);
                                        const statusActionStatus = getBlogEditorStatusActionStatus(nextStatus);

                                        return (
                                            <button
                                                key={nextStatus}
                                                type="button"
                                                onClick={() => {
                                                    if (!canEditBlog || (nextStatus === 'published' || nextStatus === 'scheduled') && !canPublishBlog) {
                                                        setSaveWarning(!canEditBlog ? editBlogDeniedMessage : publishBlogDeniedMessage);
                                                        setWorkflowNotice(null);
                                                        return;
                                                    }

                                                    clearEditorFeedback();
                                                    setStatus(nextStatus);
                                                    if (nextStatus !== 'scheduled') {
                                                        setScheduledAt(null);
                                                    }
                                                }}
                                                disabled={Boolean(statusDisabledReason)}
                                                title={statusDisabledReason || `Set status to ${nextStatus}`}
                                                aria-pressed={status === nextStatus}
                                                aria-describedby={blogEditorCommandActionStatusId}
                                                data-testid={`blog-editor-status-${nextStatus}`}
                                                data-action-state={getBlogEditorStatusActionState(nextStatus)}
                                                data-action-status={statusActionStatus}
                                                data-disabled-reason={statusDisabledReason || undefined}
                                                className={cn(
                                                    'rounded-md px-2 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                                    status === nextStatus
                                                        ? 'bg-background text-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                                                )}
                                            >
                                                {nextStatus}
                                            </button>
                                        );
                                    })}
                                </div>

                                {status === 'scheduled' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-muted-foreground">Publish date</label>
                                        <input
                                            type="datetime-local"
                                            value={toDateTimeLocalValue(scheduledAt)}
                                            min={minimumScheduledAt}
                                            onChange={(e) => {
                                                if (!canEditBlog || !canPublishBlog) return;
                                                clearEditorFeedback();
                                                setScheduledAt(fromDateTimeLocalValue(e.target.value));
                                            }}
                                            disabled={editorFormDisabled || !canPublishBlog}
                                            title={publishBlogPermissionTitle}
                                            aria-invalid={Boolean(scheduleValidationMessage)}
                                            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                            required
                                        />
                                        {scheduleValidationMessage && (
                                            <p className="text-xs text-destructive">{scheduleValidationMessage}</p>
                                        )}
                                    </div>
                                )}

	                                {(postReadiness || readinessLoading || readinessError) && (
	                                    <div className={cn('rounded-lg border px-4 py-3 text-sm', readinessTone)}>
	                                        <div className="flex items-start justify-between gap-3">
	                                            <div className="flex min-w-0 items-start gap-2">
                                                {readinessBlocked ? (
                                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                                ) : (
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="font-medium">
                                                        Readiness {postReadiness ? `${postReadiness.score}%` : `${localReadyCount}/${localReadinessChecks.length}`}
                                                    </div>
                                                    <div className="text-xs opacity-80">
                                                        {postReadiness
                                                            ? `${postReadiness.elementCount} elements${postReadiness.canvasSize ? ` · ${postReadiness.canvasSize.width}x${postReadiness.canvasSize.height}` : ''}`
                                                            : readinessError || 'Loading checks...'}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void refreshPostReadiness()}
                                                disabled={editorReadinessBusy || !canViewBlog}
                                                title={blogEditorReadinessDisabledReason || 'Refresh readiness'}
                                                aria-describedby={blogEditorCommandActionStatusId}
                                                data-testid="blog-editor-publish-panel-refresh-readiness"
                                                data-action-state={blogEditorReadinessDisabledReason ? editorReadinessBusy ? 'busy' : 'blocked' : 'ready'}
                                                data-action-status={blogEditorReadinessActionStatus}
                                                data-disabled-reason={blogEditorReadinessDisabledReason || undefined}
                                                className="rounded-lg border border-current/20 p-1.5 hover:bg-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                <RefreshCw className={cn('h-3.5 w-3.5', readinessLoading && 'animate-spin')} />
                                            </button>
                                        </div>
                                        {readinessError && <div className="mt-2 text-xs">{readinessError}</div>}
                                        {readinessFindings.length > 0 && (
                                            <div className="mt-3 grid gap-1 text-xs">
                                                {readinessFindings.slice(0, 4).map((check) => (
                                                    <div key={check.id} className="flex items-start gap-2">
                                                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                                                        <span>{check.message}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
	                                    </div>
	                                )}

	                                <div
	                                    className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground"
	                                    data-testid="blog-editor-publish-impact"
	                                    data-schema-version={blogPublishImpact.schemaVersion}
	                                    data-category-count={selectedCategoryIds.length}
	                                    data-tag-count={selectedTagIds.length}
	                                    data-featured-media-ready={selectedFeaturedImage ? 'true' : 'false'}
	                                >
	                                    <div className="flex flex-wrap items-start justify-between gap-2">
	                                        <div>
	                                            <div className="font-medium text-foreground">Publish impact</div>
	                                            <div className="mt-0.5">
	                                                {publicPath} · {selectedCategoryIds.length} categor{selectedCategoryIds.length === 1 ? 'y' : 'ies'}, {selectedTagIds.length} tag{selectedTagIds.length === 1 ? '' : 's'}, {commentMetrics.pending} pending comment{commentMetrics.pending === 1 ? '' : 's'}.
	                                            </div>
	                                        </div>
	                                        <Button
	                                            type="button"
	                                            size="sm"
	                                            variant="ghost"
                                            disabled={editorCommandBusy || !canViewBlog}
                                            title={blogEditorPublishImpactDisabledReason || undefined}
                                            onClick={() => void copyEditorHandoffText(blogPublishImpactText, 'Blog publish impact')}
                                            data-testid="blog-editor-copy-publish-impact"
                                            aria-describedby={blogEditorCommandActionStatusId}
                                            data-action-state={blogEditorPublishImpactDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorPublishImpactActionStatus}
                                            data-disabled-reason={blogEditorPublishImpactDisabledReason || undefined}
                                        >
	                                            Copy impact
	                                        </Button>
	                                    </div>
	                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
	                                        <div>
	                                            <span className="font-medium text-foreground">Route</span>
	                                            <div>{routeAvailability.status} · {blogPublishImpact.route.backendVerified ? `${existingBlogPosts.length} backend posts checked` : 'backend route check pending'}</div>
	                                            {routeConflict ? (
	                                                <div className="text-red-700">Conflicts with {routeConflict.title}</div>
	                                            ) : null}
	                                        </div>
	                                        <div>
	                                            <span className="font-medium text-foreground">Media and comments</span>
	                                            <div>{featuredImageId ? (selectedFeaturedImage ? 'featured media loaded' : 'featured media reference saved') : 'no featured media'}</div>
	                                            <div>{commentMetrics.approved} approved · {flaggedCommentCount} flagged</div>
	                                        </div>
	                                    </div>
	                                    {(selectedCategories.length > 0 || selectedTags.length > 0) ? (
	                                        <div className="mt-2 flex flex-wrap gap-1" data-testid="blog-editor-publish-impact-taxonomy">
	                                            {selectedCategories.slice(0, 4).map((category) => (
	                                                <span key={`category-${category.id}`} className="rounded bg-background px-1.5 py-0.5">
	                                                    {category.name}
	                                                </span>
	                                            ))}
	                                            {selectedTags.slice(0, 4).map((tag) => (
	                                                <span key={`tag-${tag.id}`} className="rounded bg-background px-1.5 py-0.5">
	                                                    #{tag.name}
	                                                </span>
	                                            ))}
	                                            {selectedCategoryIds.length + selectedTagIds.length > selectedCategories.slice(0, 4).length + selectedTags.slice(0, 4).length ? (
	                                                <span className="rounded bg-background px-1.5 py-0.5">
	                                                    +{selectedCategoryIds.length + selectedTagIds.length - selectedCategories.slice(0, 4).length - selectedTags.slice(0, 4).length} more
	                                                </span>
	                                            ) : null}
	                                        </div>
	                                    ) : null}
	                                </div>

	                                {editorHasUnsavedChanges && (
	                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="blog-editor-unsaved-workflow-guard">
	                                        Save this post before preview, publish, archive, or revision restore. Workflow actions use the latest saved backend copy.
                                    </div>
                                )}

                                <div className="grid gap-2">
                                    <Button
                                        type="submit"
                                        disabled={saveActionBusy || isUsingLocalPostCopy || !canSave || !canEditBlog || ((status === 'published' || status === 'scheduled') && !canPublishBlog)}
                                        title={blogEditorSaveDisabledReason || undefined}
                                        variant="primary"
                                        iconStart={<Save className="size-4" />}
                                        className="w-full"
                                        aria-describedby={blogEditorCommandActionStatusId}
                                        data-testid="blog-editor-publish-panel-save"
                                        data-action-state={blogEditorSaveDisabledReason ? saveActionBusy ? 'busy' : 'blocked' : 'ready'}
                                        data-action-status={blogEditorSaveActionStatus}
                                        data-disabled-reason={blogEditorSaveDisabledReason || undefined}
                                    >
                                        {isLoading ? 'Saving...' : submitLabel}
                                    </Button>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={() => void generatePreview()}
                                            disabled={editorPreviewBusy || isUsingLocalPostCopy || editorHasUnsavedChanges || !canPublishBlog}
                                            variant="outline"
                                            iconStart={<Eye className="size-4" />}
                                            title={blogEditorPreviewDisabledReason || undefined}
                                            aria-describedby={blogEditorCommandActionStatusId}
                                            data-testid="blog-editor-publish-panel-preview"
                                            data-action-state={blogEditorPreviewDisabledReason ? editorPreviewBusy ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorPreviewActionStatus}
                                            data-disabled-reason={blogEditorPreviewDisabledReason || undefined}
                                        >
                                            Preview
                                        </Button>
                                        <Button
                                            onClick={() => void applyWorkflow('publish')}
                                            disabled={editorActionBusy || isUsingLocalPostCopy || editorHasUnsavedChanges || readinessBlocked || routeBlocked || !interactivePublishReady || status === 'published' || !canPublishBlog}
                                            variant="secondary"
                                            iconStart={<CheckCircle2 className="size-4" />}
                                            title={blogEditorPublishDisabledReason || 'Publish post'}
                                            aria-describedby={blogEditorCommandActionStatusId}
                                            data-testid="blog-editor-publish"
                                            data-action-state={blogEditorPublishDisabledReason ? editorActionBusy ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorPublishActionStatus}
                                            data-disabled-reason={blogEditorPublishDisabledReason || undefined}
                                        >
                                            Publish
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            onClick={() => void applyWorkflow('archive')}
                                            disabled={editorActionBusy || isUsingLocalPostCopy || editorHasUnsavedChanges || status === 'archived' || !canEditBlog}
                                            variant="outline"
                                            iconStart={<Archive className="size-4" />}
                                            title={blogEditorArchiveDisabledReason || 'Archive post'}
                                            aria-describedby={blogEditorCommandActionStatusId}
                                            data-testid="blog-editor-archive"
                                            data-action-state={blogEditorArchiveDisabledReason ? editorActionBusy ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorArchiveActionStatus}
                                            data-disabled-reason={blogEditorArchiveDisabledReason || undefined}
                                        >
                                            Archive
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => navigate({ to: '/blog', search: { siteId: activeSiteId } })}
                                            disabled={editorBusy}
                                            title={blogEditorDiscardDisabledReason || 'Return to Blog'}
                                            variant="outline"
                                            aria-describedby={blogEditorCommandActionStatusId}
                                            data-testid="blog-editor-discard"
                                            data-action-state={blogEditorDiscardDisabledReason ? 'busy' : 'ready'}
                                            data-action-status={blogEditorDiscardActionStatus}
                                            data-disabled-reason={blogEditorDiscardDisabledReason || undefined}
                                        >
                                            Discard
                                        </Button>
                                    </div>
                                    <Button
                                        type="button"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        disabled={editorActionBusy || isUsingLocalPostCopy || !canDeleteBlog}
                                        title={blogEditorDeleteDisabledReason || 'Delete post'}
                                        variant="danger"
                                        iconStart={<Trash2 className="size-4" />}
                                        className="w-full"
                                        aria-describedby={blogEditorCommandActionStatusId}
                                        data-testid="blog-editor-delete"
                                        data-action-state={blogEditorDeleteDisabledReason ? editorActionBusy ? 'busy' : 'blocked' : 'ready'}
                                        data-action-status={blogEditorDeleteActionStatus}
                                        data-disabled-reason={blogEditorDeleteDisabledReason || undefined}
                                    >
                                        Delete post
                                    </Button>
                                </div>

                                {previewUrl && (
                                    <a
                                        href={previewUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <span className="truncate">
                                            Preview expires {previewExpiresAt ? new Date(previewExpiresAt).toLocaleTimeString() : 'soon'}
                                        </span>
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                    </a>
                                )}
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-media" className="scroll-mt-24">
                            <PanelHeader
                                title="Featured media"
                                description="Image used by blog cards, feeds, Open Graph previews, and custom frontend lists."
                                icon={<ImageIcon className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="overflow-hidden rounded-lg border border-border bg-background">
                                    {selectedFeaturedImageUrl ? (
                                        <img
                                            src={selectedFeaturedImageUrl}
                                            alt={selectedFeaturedImage?.altText || selectedFeaturedImage?.name || 'Featured post image'}
                                            className="aspect-video w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground">
                                            <ImageIcon className="size-8" />
                                        </div>
                                    )}
                                    <div className="space-y-1 px-3 py-3">
                                        <div className="truncate text-sm font-semibold text-foreground">
                                            {selectedFeaturedImage?.name || (featuredImageId ? featuredImageId : 'No featured image selected')}
                                        </div>
                                        <div className="text-xs leading-5 text-muted-foreground">
                                            {selectedFeaturedImage
                                                ? `${selectedFeaturedImage.type} · ${selectedFeaturedImage.visibility || 'public'} · ${selectedFeaturedImage.size}`
                                                : 'Select or upload an image scoped to this post.'}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (!canEditBlog) {
                                                setSaveWarning(editBlogDeniedMessage);
                                                return;
                                            }
                                            if (!canViewMedia) {
                                                setSaveWarning(viewMediaDeniedMessage);
                                                return;
                                            }
                                            setIsFeaturedMediaOpen(true);
	                                        }}
	                                        disabled={editorBusy || isUsingLocalPostCopy || !canEditBlog || !canViewMedia}
	                                        title={blogEditorMediaSelectDisabledReason || undefined}
	                                        iconStart={<ImageIcon className="size-4" />}
	                                        aria-describedby={blogEditorCommandActionStatusId}
	                                        data-testid="blog-editor-select-featured-image"
	                                        data-action-state={blogEditorMediaSelectDisabledReason ? editorBusy ? 'busy' : 'blocked' : 'ready'}
	                                        data-action-status={blogEditorMediaSelectActionStatus}
	                                        data-disabled-reason={blogEditorMediaSelectDisabledReason || undefined}
	                                    >
	                                        {featuredImageId ? 'Replace image' : 'Select image'}
	                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            if (!canEditBlog) return;
                                            clearEditorFeedback();
                                            setFeaturedImageId(null);
	                                        }}
	                                        disabled={editorFormDisabled || !featuredImageId}
	                                        title={blogEditorMediaClearDisabledReason || undefined}
	                                        iconStart={<X className="size-4" />}
	                                        aria-describedby={blogEditorCommandActionStatusId}
	                                        data-testid="blog-editor-clear-featured-image"
	                                        data-action-state={blogEditorMediaClearDisabledReason ? editorBusy ? 'busy' : 'blocked' : 'ready'}
	                                        data-action-status={blogEditorMediaClearActionStatus}
	                                        data-disabled-reason={blogEditorMediaClearDisabledReason || undefined}
	                                    >
	                                        Clear image
	                                    </Button>
                                </div>
                                {featuredImageId && (
                                    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
                                        featuredImageId: {featuredImageId}
                                    </div>
                                )}
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-comments" className="scroll-mt-24">
                            <PanelHeader
                                title="Comments"
                                description="Post-specific moderation state and quick review actions."
                                icon={<MessageSquare className="size-4" />}
                                action={
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
	                                        onClick={() => void loadPostComments()}
	                                        disabled={commentsBusy || !canViewComments}
	                                        title={blogEditorCommentsRefreshDisabledReason || undefined}
	                                        iconStart={<RefreshCw className={cn('size-3.5', isCommentsLoading && 'animate-spin')} />}
	                                        aria-describedby={blogEditorCommandActionStatusId}
	                                        data-testid="blog-editor-refresh-comments"
	                                        data-action-state={blogEditorCommentsRefreshDisabledReason ? commentsBusy ? 'busy' : 'blocked' : 'ready'}
	                                        data-action-status={blogEditorCommentsRefreshActionStatus}
	                                        data-disabled-reason={blogEditorCommentsRefreshDisabledReason || undefined}
	                                    >
	                                        Refresh
	                                    </Button>
                                }
                            />
                            <PanelContent className="space-y-4">
                                {commentError && (
                                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                                        {commentError}
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <BlogEditorContractTile label="Total" value={`${commentMetrics.total}`} />
                                    <BlogEditorContractTile label="Pending" value={`${commentMetrics.pending}`} />
                                    <BlogEditorContractTile label="Approved" value={`${commentMetrics.approved}`} />
                                    <BlogEditorContractTile label="Flagged" value={`${flaggedCommentCount}`} />
                                </div>
                                {pendingPostCommentIds.length > 0 && (
                                    <div className="grid gap-2 sm:grid-cols-2">
	                                        <Button
	                                            type="button"
	                                            size="sm"
	                                            onClick={() => void moderatePostComments(pendingPostCommentIds, 'approved')}
	                                            disabled={commentsBusy || !canManageComments}
	                                            title={blogEditorCommentsManageDisabledReason || 'Approve pending comments'}
	                                            iconStart={<CheckCircle2 className="size-4" />}
	                                            aria-describedby={blogEditorCommandActionStatusId}
	                                            data-testid="blog-editor-approve-pending-comments"
	                                            data-action-state={blogEditorCommentsManageDisabledReason ? commentsBusy ? 'busy' : 'blocked' : 'ready'}
	                                            data-action-status={blogEditorCommentsApprovePendingActionStatus}
	                                            data-disabled-reason={blogEditorCommentsManageDisabledReason || undefined}
	                                        >
	                                            Approve pending
	                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
	                                            variant="outline"
	                                            onClick={() => void moderatePostComments(pendingPostCommentIds, 'rejected', 'Rejected from blog post editor.')}
	                                            disabled={commentsBusy || !canManageComments}
	                                            title={blogEditorCommentsManageDisabledReason || 'Reject pending comments'}
	                                            iconStart={<XCircle className="size-4" />}
	                                            aria-describedby={blogEditorCommandActionStatusId}
	                                            data-testid="blog-editor-reject-pending-comments"
	                                            data-action-state={blogEditorCommentsManageDisabledReason ? commentsBusy ? 'busy' : 'blocked' : 'ready'}
	                                            data-action-status={blogEditorCommentsRejectPendingActionStatus}
	                                            data-disabled-reason={blogEditorCommentsManageDisabledReason || undefined}
	                                        >
	                                            Reject pending
	                                        </Button>
                                    </div>
                                )}
                                <div className="grid gap-2">
                                    {isCommentsLoading && postComments.length === 0 ? (
                                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                                            Loading post comments...
                                        </div>
                                    ) : postComments.length === 0 ? (
                                        <EmptyState
                                            icon={MessageSquare}
                                            title="No comments yet"
                                            description="Public comments for this post will appear here for quick review, with the full queue still available from Comments."
                                        />
                                    ) : postComments.slice(0, 4).map((comment) => (
                                        <BlogCommentModerationItem
                                            key={comment.id}
	                                            comment={comment}
	                                            busy={commentsBusy || updatingCommentIds.includes(comment.id) || !canManageComments}
	                                            busyReason={updatingCommentIds.includes(comment.id)
	                                                ? 'Wait for this comment moderation update to finish.'
	                                                : blogEditorCommentsManageDisabledReason}
	                                            actionStatusId={blogEditorCommandActionStatusId}
	                                            onApprove={() => void moderatePostComments([comment.id], 'approved')}
	                                            onReject={() => void moderatePostComments([comment.id], 'rejected', 'Rejected from blog post editor.')}
	                                        />
                                    ))}
                                </div>
                                <div className="grid gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
	                                        onClick={() => navigate({ to: '/comments', search: { siteId: activeSiteId, targetType: 'post', targetId: post.id } })}
	                                        disabled={editorCommandBusy || !canViewComments}
	                                        title={blogEditorCommentsOpenQueueDisabledReason || undefined}
	                                        iconStart={<ExternalLink className="size-4" />}
	                                        className="w-full"
	                                        aria-describedby={blogEditorCommandActionStatusId}
	                                        data-testid="blog-editor-open-comments-queue"
	                                        data-action-state={blogEditorCommentsOpenQueueDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
	                                        data-action-status={blogEditorCommentsOpenQueueActionStatus}
	                                        data-disabled-reason={blogEditorCommentsOpenQueueDisabledReason || undefined}
	                                    >
	                                        Open full queue
	                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
	                                        onClick={() => void copyEditorHandoffText(moderationCommentsUrl, 'Post comments moderation URL')}
	                                        disabled={editorCommandBusy || !canViewBlog}
	                                        title={blogEditorCommentsApiDisabledReason || undefined}
	                                        iconStart={<Copy className="size-4" />}
	                                        className="w-full"
	                                        aria-describedby={blogEditorCommandActionStatusId}
	                                        data-testid="blog-editor-copy-comments-api"
	                                        data-action-state={blogEditorCommentsApiDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
	                                        data-action-status={blogEditorCommentsApiActionStatus}
	                                        data-disabled-reason={blogEditorCommentsApiDisabledReason || undefined}
	                                    >
                                        Copy comments API
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-handoff" className="scroll-mt-24">
                            <PanelHeader
                                title="Frontend handoff"
                                description="Admin, public, canvas, and taxonomy contract."
                                icon={<Code2 className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="text-xs font-medium text-muted-foreground">Admin endpoint</div>
                                    <div className="mt-2 break-all font-mono text-xs text-foreground">{adminBlogPostUrl}</div>
                                </div>
                                <div className="rounded-lg border border-border bg-background p-3">
                                    <div className="text-xs font-medium text-muted-foreground">Public render</div>
                                    <div className="mt-2 break-all font-mono text-xs text-foreground">{publicRenderUrl}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <BlogEditorContractTile label="Route" value={publicPath} />
                                    <BlogEditorContractTile label="Canonical" value={normalizedCanonicalPath} />
                                    <BlogEditorContractTile label="Route check" value={routeAvailability.status} />
                                    <BlogEditorContractTile label="Canvas" value={`${canvasSize.width} x ${canvasSize.height}`} />
                                </div>
                                <pre
                                    className="max-h-72 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"
                                    data-testid="blog-editor-handoff-json"
                                >
{JSON.stringify({
    postId: post.id,
    route: publicPath,
    status,
    template: hasFrontendDesignTemplate
        ? {
            id: frontendDesignTemplate.id,
            name: frontendDesignTemplate.name || frontendDesignTemplate.id,
            routePattern: frontendDesignTemplate.routePattern || publicPath,
            bindingHints: frontendDesignTemplate.bindingHints,
        }
        : {
            id: 'backy-blog-editor',
            name: 'Backy blog editor canvas',
            routePattern: '/blog/{slug}',
            bindingHints: [],
        },
    authorId: selectedAuthorId,
    categoryIds: selectedCategoryIds,
    tagIds: selectedTagIds,
    featuredImageId,
    comments: {
        total: commentMetrics.total,
        pending: commentMetrics.pending,
        approved: commentMetrics.approved,
        flagged: flaggedCommentCount,
        moderationUrl: moderationCommentsUrl,
        publicThreadUrl: publicPostCommentsUrl,
    },
    seo: {
        title: seoTitle.trim() || title,
        description: seoDescription.trim() || excerpt,
        canonical: normalizedCanonicalPath,
        ogImage: ogImage.trim() || null,
        featuredImage: selectedFeaturedImage
            ? {
                id: selectedFeaturedImage.id,
                name: selectedFeaturedImage.name,
                url: selectedFeaturedImageUrl,
                altText: selectedFeaturedImage.altText || null,
            }
            : featuredImageId
                ? { id: featuredImageId, name: null, url: null, altText: null }
                : null,
        robots: {
            index: !noIndex,
            follow: !noFollow,
        },
    },
    endpoints: {
        publicPostBySlug: publicPostBySlugUrl,
        publicRender: publicRenderUrl,
        publicComments: publicPostCommentsUrl,
        moderationComments: moderationCommentsUrl,
        readiness: `${adminBlogPostUrl}/readiness`,
    },
}, null, 2)}
                                </pre>
                                <div className="grid gap-2">
                                    <Button
                                        type="button"
	                                        onClick={() => void copyEditorHandoffText(publicRenderUrl, 'Blog public render URL')}
	                                        disabled={editorCommandBusy || !canViewBlog}
	                                        title={blogEditorHandoffDisabledReason || undefined}
	                                        variant="outline"
	                                        iconStart={<Copy className="size-4" />}
	                                        className="w-full"
	                                        aria-describedby={blogEditorCommandActionStatusId}
	                                        data-testid="blog-editor-copy-public-url"
	                                        data-action-state={blogEditorHandoffDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
	                                        data-action-status={blogEditorHandoffActionStatus}
	                                        data-disabled-reason={blogEditorHandoffDisabledReason || undefined}
	                                    >
	                                        Copy public URL
	                                    </Button>
                                    <Button
                                        type="button"
	                                        onClick={() => void copyEditorHandoffText(editorHandoffText, 'Blog editor handoff manifest')}
	                                        disabled={editorCommandBusy || !canViewBlog}
	                                        title={blogEditorHandoffDisabledReason || undefined}
	                                        variant="outline"
	                                        iconStart={<Copy className="size-4" />}
	                                        className="w-full"
	                                        aria-describedby={blogEditorCommandActionStatusId}
	                                        data-testid="blog-editor-handoff-panel-copy-handoff"
	                                        data-action-state={blogEditorHandoffDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
	                                        data-action-status={blogEditorHandoffActionStatus}
	                                        data-disabled-reason={blogEditorHandoffDisabledReason || undefined}
	                                    >
                                        Copy handoff
                                    </Button>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel
                            id="blog-editor-newsletter"
                            className="scroll-mt-24"
                            data-testid="blog-editor-newsletter-issue"
                            data-newsletter-issue-schema="backy.blog-newsletter-issue-source.v1"
                            data-send-ready-sync-url={newsletterSendableSubscribersUrl}
                            data-contact-sync-url={newsletterContactSyncUrl}
                        >
                            <PanelHeader
                                title="Newsletter issue"
                                description="Provider-safe handoff for turning this report into a subscriber issue."
                                icon={<Send className="size-4" />}
                            />
                            <PanelContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <BlogEditorContractTile label="Post status" value={status} />
                                    <BlogEditorContractTile label="Issue source" value={status === 'published' ? 'Ready' : 'Publish or schedule first'} />
                                    <BlogEditorContractTile label="Subscribers" value="audience=sendable" />
                                    <BlogEditorContractTile label="Delivery" value="External provider" />
                                </div>
                                <div
                                    className="rounded-lg border border-border bg-background p-3"
                                    data-testid="blog-editor-newsletter-issue-draft"
                                    data-issue-draft-schema={newsletterIssueDraft?.schemaVersion || 'backy.newsletter-issue-draft.v1'}
                                    data-issue-draft-id={newsletterIssueDraft?.issueDraft.id || ''}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-xs font-medium uppercase text-muted-foreground">Issue draft builder</div>
                                            <p className="mt-1 text-sm text-foreground">
                                                Build a copyable provider draft from the saved post plus the private send-ready audience contract.
                                            </p>
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                Draft payloads include recipient ids and counts, not raw subscriber emails or provider secrets.
                                            </p>
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={() => void handleBuildNewsletterIssueDraft()}
                                            disabled={Boolean(blogEditorNewsletterIssueDraftDisabledReason)}
                                            title={blogEditorNewsletterIssueDraftDisabledReason || undefined}
                                            variant="primary"
                                            iconStart={<Send className="size-4" />}
                                            aria-describedby={blogEditorCommandActionStatusId}
                                            data-testid="blog-editor-build-newsletter-issue-draft"
                                            data-action-state={blogEditorNewsletterIssueDraftDisabledReason ? isBuildingNewsletterIssueDraft ? 'busy' : 'blocked' : 'ready'}
                                            data-action-status={blogEditorNewsletterIssueDraftActionStatus}
                                            data-disabled-reason={blogEditorNewsletterIssueDraftDisabledReason || undefined}
                                        >
                                            {isBuildingNewsletterIssueDraft ? 'Building...' : 'Build issue draft'}
                                        </Button>
                                    </div>
                                    {newsletterIssueDraftError && (
                                        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                            {newsletterIssueDraftError}
                                        </div>
                                    )}
                                    {newsletterIssueDraft && (
                                        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
                                            <pre
                                                className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"
                                                data-testid="blog-editor-newsletter-issue-draft-json"
                                            >
{newsletterIssueDraftText}
                                            </pre>
                                            <div className="space-y-2">
                                                <BlogEditorContractTile label="Draft" value={newsletterIssueDraft.issueDraft.id} />
                                                <BlogEditorContractTile label="Audience" value={`${newsletterIssueDraft.issueDraft.audience.selectedRecipientCount} send-ready`} />
                                                <Button
                                                    type="button"
                                                    onClick={() => void copyEditorHandoffText(newsletterIssueDraftText, 'Newsletter issue draft')}
                                                    disabled={!newsletterIssueDraftText || editorCommandBusy || !canViewBlog}
                                                    variant="outline"
                                                    iconStart={<Copy className="size-4" />}
                                                    className="w-full"
                                                    data-testid="blog-editor-copy-newsletter-issue-draft"
                                                    data-action-state={newsletterIssueDraftText && !editorCommandBusy && canViewBlog ? 'ready' : 'blocked'}
                                                >
                                                    Copy draft
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-lg border border-border bg-background p-3">
                                        <div className="text-xs font-medium text-muted-foreground">Send-ready subscriber sync</div>
                                        <div className="mt-2 break-all font-mono text-xs text-foreground">{newsletterSendableSubscribersUrl}</div>
                                    </div>
                                    <div className="rounded-lg border border-border bg-background p-3">
                                        <div className="text-xs font-medium text-muted-foreground">Contact sync template</div>
                                        <div className="mt-2 break-all font-mono text-xs text-foreground">{newsletterContactSyncUrl}</div>
                                    </div>
                                </div>
                                <pre
                                    className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"
                                    data-testid="blog-editor-newsletter-handoff-json"
                                >
{newsletterIssueHandoffText}
                                </pre>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button
                                        type="button"
                                        onClick={() => void copyEditorHandoffText(newsletterIssueHandoffText, 'Blog newsletter issue handoff')}
                                        disabled={editorCommandBusy || !canViewBlog}
                                        title={blogEditorHandoffDisabledReason || undefined}
                                        variant="outline"
                                        iconStart={<Copy className="size-4" />}
                                        className="w-full"
                                        aria-describedby={blogEditorCommandActionStatusId}
                                        data-testid="blog-editor-copy-newsletter-issue-handoff"
                                        data-action-state={blogEditorHandoffDisabledReason ? editorCommandBusy ? 'busy' : 'blocked' : 'ready'}
                                        data-action-status={blogEditorHandoffActionStatus}
                                        data-disabled-reason={blogEditorHandoffDisabledReason || undefined}
                                    >
                                        Copy issue handoff
                                    </Button>
                                    <Link
                                        to="/newsletter"
                                        search={{ siteId: activeSiteId }}
                                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition-colors hover:bg-accent focus-ring"
                                        data-testid="blog-editor-open-newsletter"
                                        data-target-site-id={activeSiteId}
                                    >
                                        <Send className="size-4" />
                                        Open Newsletter
                                    </Link>
                                </div>
                                <div className="rounded-lg border border-dashed border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                                    Backy provides the post source, public render/resolve URLs, send-ready subscriber sync, contact sync template, and consent-safe audience state. Keep provider API keys, SMTP credentials, bounce webhook secrets, and mailbox credentials outside copied article or canvas payloads.
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-taxonomy" className="scroll-mt-24">
                            <PanelHeader title="Author" icon={<UserRound className="size-4" />} />
                            <PanelContent className="space-y-2">
	                                <select
	                                    value={selectedAuthorId}
	                                    onChange={(event) => {
	                                        clearEditorFeedback();
	                                        setSelectedAuthorId(event.target.value);
	                                    }}
	                                    disabled={editorFormDisabled}
	                                    title={blogEditorTaxonomyDisabledReason || 'Choose blog author'}
	                                    aria-describedby={blogEditorCommandActionStatusId}
	                                    data-testid="blog-editor-author-select"
	                                    data-action-state={blogEditorTaxonomyDisabledReason ? editorBusy ? 'busy' : 'blocked' : 'ready'}
	                                    data-action-status={blogEditorAuthorActionStatus}
	                                    data-disabled-reason={blogEditorTaxonomyDisabledReason || undefined}
	                                    className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
	                                >
                                    {authors.length === 0 ? (
                                        <option value={selectedAuthorId}>{selectedAuthorId}</option>
                                    ) : authors.map((author) => (
                                        <option key={author.id} value={author.id}>
                                            {author.name}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Globe className="size-3.5" />
                                    <span>{selectedAuthor?.postCount ?? 0} existing post{(selectedAuthor?.postCount ?? 0) === 1 ? '' : 's'}</span>
                                </div>
                            </PanelContent>
                        </Panel>

                        <Panel className="scroll-mt-24">
                            <PanelHeader title="Taxonomy" icon={<Tags className="size-4" />} />
                            <PanelContent className="space-y-5">
                                <TaxonomyPicker
                                    title="Categories"
                                    emptyLabel="No categories yet."
	                                    items={categories}
	                                    selectedIds={selectedCategoryIds}
	                                    onToggle={(id) => toggleSelection(id, selectedCategoryIds, setSelectedCategoryIds)}
	                                    disabled={editorFormDisabled}
	                                    disabledReason={blogEditorTaxonomyDisabledReason}
	                                    actionStatusId={blogEditorCommandActionStatusId}
	                                    kind="category"
	                                />
	                                <TaxonomyPicker
	                                    title="Tags"
                                    emptyLabel="No tags yet."
	                                    items={tags}
	                                    selectedIds={selectedTagIds}
	                                    onToggle={(id) => toggleSelection(id, selectedTagIds, setSelectedTagIds)}
	                                    disabled={editorFormDisabled}
	                                    disabledReason={blogEditorTaxonomyDisabledReason}
	                                    actionStatusId={blogEditorCommandActionStatusId}
	                                    kind="tag"
	                                />
                            </PanelContent>
                        </Panel>

                        <Panel id="blog-editor-revisions" className="scroll-mt-24">
                            <PanelHeader title="Revisions" icon={<History className="size-4" />} />
                            <PanelContent>
                                {revisions.length === 0 ? (
                                    <EmptyState
                                        icon={History}
                                        title="No saved revisions yet"
                                        description="Save this post after editing to create a restorable revision snapshot for the article and canvas."
                                    />
                                ) : (
                                    <div className="grid gap-2">
                                        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground" data-testid="blog-editor-revision-graph">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <span className="font-medium text-foreground">Revision branch graph</span>
                                                    <span> · {revisions.length} saved node{revisions.length === 1 ? '' : 's'} across {blogRevisionBranchGraph.branchCount} branch{blogRevisionBranchGraph.branchCount === 1 ? '' : 'es'}</span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-1">
	                                                    <button
	                                                        type="button"
	                                                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-primary hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
	                                                        onClick={() => void copyEditorHandoffText(blogRevisionBranchGraphText, 'Blog revision branch graph')}
	                                                        disabled={editorCommandBusy}
	                                                        title={blogEditorRevisionGraphDisabledReason || 'Copy revision branch graph'}
	                                                        aria-describedby={blogEditorCommandActionStatusId}
	                                                        data-testid="blog-editor-copy-revision-branch-graph"
	                                                        data-action-state={blogEditorRevisionGraphDisabledReason ? 'busy' : 'ready'}
	                                                        data-action-status={blogEditorRevisionGraphCopyActionStatus}
	                                                        data-disabled-reason={blogEditorRevisionGraphDisabledReason || undefined}
	                                                    >
                                                        <Copy className="size-3.5" />
                                                        Copy graph
                                                    </button>
                                                    {revisions.length > BLOG_REVISION_COLLAPSED_COUNT ? (
                                                        <button
                                                            type="button"
	                                                            className="rounded-md px-2 py-1 font-medium text-primary hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
	                                                            onClick={() => setIsRevisionTimelineExpanded((current) => !current)}
	                                                            disabled={editorCommandBusy}
	                                                            title={blogEditorRevisionGraphDisabledReason || (isRevisionTimelineExpanded ? 'Show latest revisions' : `Show all ${revisions.length} revisions`)}
	                                                            aria-describedby={blogEditorCommandActionStatusId}
	                                                            data-testid="blog-editor-toggle-revision-graph"
	                                                            data-action-state={blogEditorRevisionGraphDisabledReason ? 'busy' : 'ready'}
	                                                            data-action-status={blogEditorRevisionGraphToggleActionStatus}
	                                                            data-disabled-reason={blogEditorRevisionGraphDisabledReason || undefined}
	                                                        >
                                                            {isRevisionTimelineExpanded ? 'Show latest' : `Show all ${revisions.length}`}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {blogRevisionTimeline.map((node) => {
                                                    const isNodeVisible = visibleRevisionIds.has(node.id);
                                                    const nodeClassName = cn(
                                                        'rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary',
                                                        !isNodeVisible ? 'opacity-60' : '',
                                                    );

                                                    return isNodeVisible ? (
                                                        <a
                                                            key={node.id}
                                                            href={`#blog-editor-revision-${node.id}`}
                                                            className={nodeClassName}
                                                            title={node.summary}
                                                            aria-label={node.summary}
                                                            data-action={node.action}
                                                            data-actor={node.actor}
                                                            data-testid={`blog-editor-revision-graph-node-${node.id}`}
                                                        >
                                                            {node.position}
                                                        </a>
                                                    ) : (
                                                        <button
                                                            key={node.id}
                                                            type="button"
                                                            className={nodeClassName}
                                                            onClick={() => expandRevisionTimelineTo(node.id)}
                                                            disabled={editorCommandBusy}
                                                            title={node.summary}
                                                            aria-label={node.summary}
                                                            data-action={node.action}
                                                            data-actor={node.actor}
                                                            data-testid={`blog-editor-revision-graph-node-${node.id}`}
                                                        >
                                                            {node.position}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="mt-3 grid gap-2" data-testid="blog-editor-revision-branch-graph" data-branch-count={blogRevisionBranchGraph.branchCount}>
                                                {blogRevisionBranchGraph.branches.map((branch) => (
                                                    <div
                                                        key={branch.id}
                                                        className="rounded-md border border-border bg-background px-2 py-2"
                                                        data-testid={`blog-editor-revision-branch-${branch.id}`}
                                                        data-lane={branch.lane}
                                                        data-node-count={branch.nodeIds.length}
                                                        data-restore-target-id={branch.restoreTargetRevisionId || ''}
                                                    >
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">lane {branch.lane}</span>
                                                            <span className="font-medium text-foreground">{branch.label}</span>
                                                            <span className={cn(
                                                                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                                                                branch.status === 'active'
                                                                    ? 'bg-emerald-50 text-emerald-700'
                                                                    : branch.status === 'pending-save'
                                                                        ? 'bg-amber-50 text-amber-700'
                                                                        : 'bg-muted text-muted-foreground',
                                                            )}
                                                            >
                                                                {branch.status}
                                                            </span>
                                                        </div>
                                                        {branch.branchPointRevisionId && (
                                                            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                                                                Forked after rollback checkpoint #{blogRevisionTimelineById.get(branch.branchPointRevisionId)?.position || '?'} from revision #{branch.restoreTargetPosition || '?'}.
                                                            </div>
                                                        )}
                                                        <div className="mt-2 flex flex-wrap gap-1">
                                                            {branch.nodeIds.length > 0 ? branch.nodeIds.map((nodeId) => {
                                                                const node = blogRevisionTimelineById.get(nodeId);
                                                                if (!node) return null;

                                                                return visibleRevisionIds.has(nodeId) ? (
                                                                    <a
                                                                        key={nodeId}
                                                                        href={`#blog-editor-revision-${nodeId}`}
                                                                        className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:border-primary/50 hover:text-primary"
                                                                        title={node.summary}
                                                                        data-testid={`blog-editor-revision-branch-node-${nodeId}`}
                                                                        data-branch-id={node.branchId}
                                                                        data-branch-role={node.branchRole}
                                                                    >
                                                                        #{node.position}
                                                                    </a>
                                                                ) : (
                                                                    <button
                                                                        key={nodeId}
                                                                        type="button"
                                                                        className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground opacity-70 hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                                                        onClick={() => expandRevisionTimelineTo(nodeId)}
                                                                        disabled={editorCommandBusy}
                                                                        title={node.summary}
                                                                        data-testid={`blog-editor-revision-branch-node-${nodeId}`}
                                                                        data-branch-id={node.branchId}
                                                                        data-branch-role={node.branchRole}
                                                                    >
                                                                        #{node.position}
                                                                    </button>
                                                                );
                                                            }) : (
                                                                <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                                                                    Next save after restore will appear on this branch.
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            {blogRevisionBranchGraph.edges.some((edge) => edge.kind === 'rollback-target') ? (
                                                <div className="mt-2 grid gap-1" data-testid="blog-editor-revision-branch-edges">
                                                    {blogRevisionBranchGraph.edges
                                                        .filter((edge) => edge.kind === 'rollback-target')
                                                        .map((edge) => (
                                                            <div key={edge.id} className="flex flex-wrap items-center gap-1 text-[11px]">
                                                                <span className="rounded bg-background px-1.5 py-0.5 font-mono text-foreground">
                                                                    #{blogRevisionTimelineById.get(edge.fromId)?.position || '?'} restores #{blogRevisionTimelineById.get(edge.toId)?.position || '?'}
                                                                </span>
                                                                <span>{edge.label}</span>
                                                                {edge.inferred && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">inferred</span>}
                                                            </div>
                                                        ))}
                                                </div>
                                            ) : null}
                                            <div className="mt-2 grid gap-1" data-testid="blog-editor-revision-graph-summary">
                                                {blogRevisionTimeline.slice(0, 3).map((node) => (
                                                    <div key={node.id} className="flex flex-wrap items-center gap-1">
                                                        <span className="font-mono text-foreground">#{node.position}</span>
                                                        <span>{node.action}</span>
                                                        <span>by {node.actor}</span>
                                                        <span className="rounded bg-background px-1.5 py-0.5">{node.status}</span>
                                                        <span>updated {node.snapshotUpdatedLabel}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {hiddenRevisionCount > 0 ? (
                                                <div className="mt-1">Showing latest {visibleRevisions.length}; {hiddenRevisionCount} older revision{hiddenRevisionCount === 1 ? '' : 's'} remain in the graph.</div>
                                            ) : null}
                                        </div>

                                        {visibleRevisions.map((revision) => {
                                            const revisionDiff = revisionDiffById.get(revision.id);
                                            const layerDelta = revisionDiff?.layerDelta || 0;
                                            const revisionGraphNode = blogRevisionTimelineById.get(revision.id);

                                            return (
                                                <div key={revision.id} id={`blog-editor-revision-${revision.id}`} className="scroll-mt-24 rounded-lg border border-border px-3 py-2">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-medium">{revision.note || 'Revision snapshot'}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {new Date(revision.createdAt).toLocaleString()} · {revision.snapshotStatus}
                                                                {revisionGraphNode ? ` · ${revisionGraphNode.label}${revisionGraphNode.isLatest ? ' · latest' : revisionGraphNode.isOldest ? ' · oldest' : ''}` : ''}
                                                            </div>
                                                            <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground" data-testid={`blog-editor-revision-metadata-${revision.id}`}>
                                                                <span className="rounded bg-muted px-1.5 py-0.5">Action: {getContentRevisionActionLabel(revision)}</span>
                                                                <span className="rounded bg-muted px-1.5 py-0.5">Actor: {getContentRevisionActorLabel(revision)}</span>
                                                                <span className="rounded bg-muted px-1.5 py-0.5">Snapshot updated: {getContentRevisionSnapshotUpdatedLabel(revision)}</span>
                                                            </div>
                                                            {revisionGraphNode && (
                                                                <div className="mt-1 text-[11px] text-muted-foreground">
                                                                    Branch: lane {revisionGraphNode.branchLane} · {revisionGraphNode.branchLabel}
                                                                </div>
                                                            )}
                                                            {revisionGraphNode?.restoreTargetLabel && (
                                                                <div className="mt-1 text-[11px] text-amber-700">
                                                                    Restores {revisionGraphNode.restoreTargetLabel}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-1">
                                                            {revisionGraphNode?.newerId ? (
                                                                <a
                                                                    href={`#blog-editor-revision-${revisionGraphNode.newerId}`}
                                                                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    data-testid={`blog-editor-revision-newer-${revision.id}`}
                                                                >
                                                                    Newer
                                                                </a>
                                                            ) : null}
                                                            {revisionGraphNode?.olderId && visibleRevisionIds.has(revisionGraphNode.olderId) ? (
                                                                <a
                                                                    href={`#blog-editor-revision-${revisionGraphNode.olderId}`}
                                                                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                    data-testid={`blog-editor-revision-older-${revision.id}`}
                                                                >
                                                                    Older
                                                                </a>
                                                            ) : revisionGraphNode?.olderId ? (
                                                                <button
                                                                    type="button"
                                                                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
	                                                            onClick={() => expandRevisionTimelineTo(revisionGraphNode.olderId || revision.id)}
	                                                            disabled={editorCommandBusy}
	                                                            title={blogEditorRevisionGraphDisabledReason || `Show older revision ${revisionGraphNode.olderId || revision.id}`}
	                                                            aria-describedby={blogEditorCommandActionStatusId}
	                                                            data-testid={`blog-editor-revision-older-${revision.id}`}
	                                                            data-action-state={blogEditorRevisionGraphDisabledReason ? 'busy' : 'ready'}
	                                                            data-action-status={blogEditorRevisionGraphDisabledReason ? `Older revision unavailable: ${blogEditorRevisionGraphDisabledReason}` : 'Older revision navigation available.'}
	                                                            data-disabled-reason={blogEditorRevisionGraphDisabledReason || undefined}
	                                                        >
                                                                    Older
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                type="button"
                                                                disabled={editorCommandBusy}
                                                                onClick={() => void copyBlogRevisionCompare(revision)}
                                                                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
	                                                                title="Copy revision comparison"
	                                                                aria-label={`Copy comparison for revision ${revision.id}`}
	                                                                aria-describedby={blogEditorCommandActionStatusId}
	                                                                data-testid={`blog-editor-copy-revision-compare-${revision.id}`}
	                                                                data-action-state={blogEditorRevisionGraphDisabledReason ? 'busy' : 'ready'}
	                                                                data-action-status={blogEditorRevisionGraphDisabledReason ? `Copy revision comparison unavailable: ${blogEditorRevisionGraphDisabledReason}` : 'Copy revision comparison available.'}
	                                                                data-disabled-reason={blogEditorRevisionGraphDisabledReason || undefined}
	                                                            >
                                                                <Copy className="h-4 w-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={editorActionBusy || isUsingLocalPostCopy || editorHasUnsavedChanges || !canEditBlog}
	                                                                onClick={() => setPendingRestoreRevision(revision)}
	                                                                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
	                                                                title={blogEditorRestoreDisabledReason || 'Restore revision'}
	                                                                aria-label={`Restore revision ${revision.id}`}
	                                                                aria-describedby={blogEditorCommandActionStatusId}
	                                                                data-testid={`blog-editor-restore-revision-${revision.id}`}
	                                                                data-action-state={blogEditorRestoreDisabledReason ? editorActionBusy ? 'busy' : 'blocked' : 'ready'}
	                                                                data-action-status={blogEditorRestoreActionStatus}
	                                                                data-disabled-reason={blogEditorRestoreDisabledReason || undefined}
	                                                            >
                                                                <RotateCcw className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div
                                                        className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-5 text-muted-foreground"
                                                        data-testid={`blog-editor-revision-diff-${revision.id}`}
                                                    >
                                                        <div className="font-medium text-foreground">{revisionDiff?.summary}</div>
                                                        {revisionDiff?.details.length ? (
                                                            <div className="mt-1 grid gap-1" data-testid={`blog-editor-revision-diff-details-${revision.id}`}>
                                                                {revisionDiff.details.map((detail) => (
                                                                    <div key={detail.field} className="grid gap-1 border-t border-border/60 pt-1 first:border-t-0 sm:grid-cols-[72px_1fr]">
                                                                        <span className="font-semibold text-foreground">{detail.label}</span>
                                                                        <span className="min-w-0 [overflow-wrap:anywhere]">
                                                                            <span className="text-muted-foreground">Snapshot </span>
                                                                            <span className="font-mono text-foreground">{detail.snapshot}</span>
                                                                            <span className="text-muted-foreground">{' -> Current '}</span>
                                                                            <span className="font-mono text-foreground">{detail.current}</span>
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                        {revisionDiff ? (
                                                            <RevisionCanvasVisualDiff
                                                                testId={`blog-editor-revision-visual-diff-${revision.id}`}
                                                                snapshotElements={revision.snapshotElements}
                                                                currentElements={canvasElements}
                                                                snapshotCanvasWidth={revision.snapshotCanvas.canvasWidth}
                                                                snapshotCanvasHeight={revision.snapshotCanvas.canvasHeight}
                                                                currentCanvasWidth={canvasSize.width}
                                                                currentCanvasHeight={canvasSize.height}
                                                                elementDiff={revisionDiff.elementDiff}
                                                                pixelComparison={revisionDiff.renderedPixelDiff}
                                                            />
                                                        ) : null}
                                                        {revisionDiff?.elementDiff.totalChanged ? (
                                                            <div className="mt-2 border-t border-border/60 pt-2" data-testid={`blog-editor-revision-element-diff-${revision.id}`}>
                                                                <div className="font-medium text-foreground">Canvas elements: {revisionDiff.elementDiff.summary}</div>
                                                                <div className="mt-1 grid gap-1">
                                                                    {revisionDiff.elementDiff.changes.map((change) => (
                                                                        <div key={`${change.kind}-${change.id}`} className="grid gap-1 border-t border-border/60 pt-1 first:border-t-0">
                                                                            <div className="flex flex-wrap items-center gap-1 text-foreground">
                                                                                <span className="font-semibold capitalize">{change.kind}</span>
                                                                                <span className="font-mono">{change.type}</span>
                                                                                <span className="min-w-0 [overflow-wrap:anywhere]">{change.label}</span>
                                                                            </div>
                                                                            <details className="pl-2" open={change.propertyChangeCount <= 3}>
                                                                                <summary className="cursor-pointer font-medium text-primary">
                                                                                    {change.propertyChangeCount} changed propert{change.propertyChangeCount === 1 ? 'y' : 'ies'}
                                                                                </summary>
                                                                                <div className="mt-1 grid gap-1">
                                                                                    {change.properties.map((property) => (
                                                                                        <div key={property.property} className="min-w-0 [overflow-wrap:anywhere]">
                                                                                            <span className="font-mono text-foreground">{property.property}</span>
                                                                                            <span className="text-muted-foreground"> Snapshot </span>
                                                                                            <span>{property.snapshot}</span>
                                                                                            <span className="text-muted-foreground">{' -> Current '}</span>
                                                                                            <span>{property.current}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </details>
                                                                        </div>
                                                                    ))}
                                                                    {revisionDiff.elementDiff.totalChanged > revisionDiff.elementDiff.changes.length ? (
                                                                        <div>{revisionDiff.elementDiff.totalChanged - revisionDiff.elementDiff.changes.length} more changed element{revisionDiff.elementDiff.totalChanged - revisionDiff.elementDiff.changes.length === 1 ? '' : 's'} summarized by the diff totals.</div>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                        <div>
                                                            Snapshot: {revision.snapshotCanvas.totalLayerCount} layer{revision.snapshotCanvas.totalLayerCount === 1 ? '' : 's'}
                                                            {' '}({revision.snapshotCanvas.rootLayerCount} root, depth {revision.snapshotCanvas.maxDepth || 0}).
                                                            {' '}Current delta: {layerDelta === 0 ? 'no layer change' : `${layerDelta > 0 ? '+' : ''}${layerDelta} layer${Math.abs(layerDelta) === 1 ? '' : 's'}`}.
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </PanelContent>
                        </Panel>
                    </aside>
                    )}
                </form>

                <MediaLibraryModal
                    isOpen={isFeaturedMediaOpen}
                    onClose={() => {
                        if (!editorBusy) {
                            setIsFeaturedMediaOpen(false);
                        }
                    }}
                    onSelect={(asset) => {
                        if (editorBusy || !canEditBlog || !canViewMedia) return;

                        const deliveryUrl = asset.url || getPublicMediaFileUrl(asset.id, activeSiteId);
                        clearEditorFeedback();
                        setFeaturedImageId(asset.id);
                        if (!ogImage.trim()) {
                            setOgImage(deliveryUrl);
                        }
                        setWorkflowNotice(`Selected ${asset.name} as the featured image. Save to persist the post reference.`);
                        setIsFeaturedMediaOpen(false);
                    }}
                    allowedTypes="image"
                    initialUploadFilter="image"
                    mediaContext={{
                        siteId: activeSiteId,
                        scope: 'post',
                        targetId: postId,
                        targetLabel: title || post.title,
                    }}
                    allowScopeSwitcher={true}
                    canView={canViewMedia}
                    canCreate={canCreateMedia}
                    viewDisabledReason={viewMediaDeniedMessage}
                    createDisabledReason={createMediaDeniedMessage}
                />

                {pendingRestoreRevision && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" data-testid="blog-editor-restore-confirm">
                        <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl">
                            <div className="flex items-start gap-3">
                                <span className="rounded-lg bg-amber-50 p-2 text-amber-700">
                                    <RotateCcw className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Restore this revision?</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Current post fields and canvas content will be replaced by this saved snapshot.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                                <div className="font-medium text-foreground">
                                    {pendingRestoreRevision.note || pendingRestoreRevision.snapshotTitle || 'Revision snapshot'}
                                </div>
                                <div>
                                    {new Date(pendingRestoreRevision.createdAt).toLocaleString()} · {pendingRestoreRevision.snapshotStatus}
                                    {pendingRestoreRevisionGraphNode ? ` · ${pendingRestoreRevisionGraphNode.label}` : ''}
                                </div>
                            </div>
                            {pendingRestoreRevisionDiff ? (
                                <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground" data-testid="blog-editor-restore-impact">
                                    <div className="font-medium text-foreground">Restore impact</div>
                                    <div className="mt-1">{pendingRestoreRevisionDiff.summary}</div>
                                    <div className="mt-2 grid gap-1">
                                        <div>
                                            <span className="text-muted-foreground">Layers </span>
                                            <span className="font-mono text-foreground">
                                                {pendingRestoreRevisionDiff.currentLayerCount} current -&gt; {pendingRestoreRevisionDiff.snapshotLayerCount} snapshot
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Canvas elements </span>
                                            <span className="font-mono text-foreground">{pendingRestoreRevisionDiff.elementDiff.summary}</span>
                                        </div>
                                    </div>
                                    {pendingRestoreRevisionDiff.details.length ? (
                                        <div className="mt-2 grid gap-1" data-testid="blog-editor-restore-impact-details">
                                            {pendingRestoreRevisionDiff.details.slice(0, 4).map((detail) => (
                                                <div key={detail.field} className="grid gap-1 border-t border-border/60 pt-1 first:border-t-0">
                                                    <span className="font-semibold text-foreground">{detail.label}</span>
                                                    <span className="min-w-0 [overflow-wrap:anywhere]">
                                                        <span className="text-muted-foreground">Current </span>
                                                        <span className="font-mono text-foreground">{detail.current}</span>
                                                        <span className="text-muted-foreground"> -&gt; Snapshot </span>
                                                        <span className="font-mono text-foreground">{detail.snapshot}</span>
                                                    </span>
                                                </div>
                                            ))}
                                            {pendingRestoreRevisionDiff.details.length > 4 ? (
                                                <div>
                                                    {pendingRestoreRevisionDiff.details.length - 4} more changed area{pendingRestoreRevisionDiff.details.length - 4 === 1 ? '' : 's'} listed on the revision card.
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <div className="mt-2">No visible field or canvas difference from the current saved post.</div>
                                    )}
                                </div>
                            ) : null}
                            <div className="mt-5 flex justify-end gap-2">
	                                <button
	                                    type="button"
	                                    onClick={() => setPendingRestoreRevision(null)}
	                                    disabled={editorCommandBusy}
	                                    title={blogEditorRestoreCancelDisabledReason || 'Cancel restore'}
	                                    aria-describedby={blogEditorCommandActionStatusId}
	                                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
	                                    data-testid="blog-editor-cancel-restore"
	                                    data-action-state={blogEditorRestoreCancelDisabledReason ? 'busy' : 'ready'}
	                                    data-action-status={blogEditorRestoreCancelActionStatus}
	                                    data-disabled-reason={blogEditorRestoreCancelDisabledReason || undefined}
	                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
	                                    onClick={() => void restoreRevision(pendingRestoreRevision)}
	                                    disabled={editorActionBusy || isUsingLocalPostCopy || editorHasUnsavedChanges || !canEditBlog}
	                                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
	                                    title={blogEditorRestoreDisabledReason || 'Confirm restore revision'}
	                                    aria-describedby={blogEditorCommandActionStatusId}
	                                    data-testid="blog-editor-confirm-restore"
	                                    data-action-state={blogEditorRestoreDisabledReason ? editorActionBusy ? 'busy' : 'blocked' : 'ready'}
	                                    data-action-status={blogEditorRestoreActionStatus}
	                                    data-disabled-reason={blogEditorRestoreDisabledReason || undefined}
	                                >
                                    {isWorkflowBusy ? 'Restoring...' : 'Restore revision'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showDeleteConfirm && post && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm" data-testid="blog-editor-delete-confirm">
                        <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl">
                            <div className="flex items-start gap-3">
                                <span className="rounded-lg bg-red-50 p-2 text-red-600">
                                    <Trash2 className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Delete {title || post.title}?</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        This removes the post from the backend and public delivery. Archive it instead if you only want to hide it.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                                Route: <span className="font-medium text-foreground">/blog/{slug || post.slug}</span>
                            </div>
                            <div className="mt-5 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={editorCommandBusy}
                                    title={blogEditorDeleteCancelDisabledReason || 'Cancel delete'}
                                    aria-describedby={blogEditorCommandActionStatusId}
                                    data-testid="blog-editor-cancel-delete"
                                    data-action-state={blogEditorDeleteCancelDisabledReason ? 'busy' : 'ready'}
                                    data-action-status={blogEditorDeleteCancelActionStatus}
                                    data-disabled-reason={blogEditorDeleteCancelDisabledReason || undefined}
                                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleDelete()}
                                    disabled={editorActionBusy || isUsingLocalPostCopy || !canDeleteBlog}
                                    title={blogEditorDeleteDisabledReason || 'Confirm delete post'}
                                    aria-describedby={blogEditorCommandActionStatusId}
                                    data-testid="blog-editor-confirm-delete"
                                    data-action-state={blogEditorDeleteDisabledReason ? editorActionBusy ? 'busy' : 'blocked' : 'ready'}
                                    data-action-status={blogEditorDeleteActionStatus}
                                    data-disabled-reason={blogEditorDeleteDisabledReason || undefined}
                                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isWorkflowBusy ? 'Deleting...' : 'Delete post'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    );
}

const slugify = (value: string) => (
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
);

const normalizeCanonicalPath = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '/';
    return trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^\/+/, '')}`;
};

function BlogEditorMetaTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-3">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 truncate text-sm font-semibold">{value}</div>
        </div>
    );
}

function BlogEditorContractTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2">
            <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 truncate font-mono text-xs text-foreground">{value}</div>
        </div>
    );
}

function BlogEditorReadinessCheck({ label, detail, ready }: { label: string; detail: string; ready: boolean }) {
    const Icon = ready ? CheckCircle2 : AlertTriangle;

    return (
        <div className="flex min-w-0 items-start gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Icon className={cn('mt-0.5 size-4 shrink-0', ready ? 'text-emerald-600' : 'text-amber-600')} />
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function BlogEditorWorkflowStep({ index, label, detail }: { index: number; label: string; detail: string }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-semibold text-primary">
                {index}
            </span>
            <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</div>
            </div>
        </div>
    );
}

function BlogCommentModerationItem({
    comment,
    busy,
    busyReason,
    actionStatusId,
    onApprove,
    onReject,
}: {
    comment: AdminComment;
    busy: boolean;
    busyReason: string;
    actionStatusId: string;
    onApprove: () => void;
    onReject: () => void;
}) {
    const reported = (comment.reportCount || 0) > 0 || Boolean(comment.reportReasons?.length);
    const approveDisabledReason = busy
        ? busyReason || 'Wait for the current comment moderation workflow to finish.'
        : comment.status === 'approved'
            ? 'Comment is already approved.'
            : '';
    const rejectDisabledReason = busy
        ? busyReason || 'Wait for the current comment moderation workflow to finish.'
        : comment.status === 'rejected'
            ? 'Comment is already rejected.'
            : '';
    const approveActionStatus = approveDisabledReason
        ? `Approve comment unavailable: ${approveDisabledReason}`
        : 'Approve comment available.';
    const rejectActionStatus = rejectDisabledReason
        ? `Reject comment unavailable: ${rejectDisabledReason}`
        : 'Reject comment available.';

    return (
        <article className="rounded-lg border border-border bg-background px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                            {comment.authorName || comment.authorEmail || 'Anonymous'}
                        </span>
                        <StatusBadge status={comment.status} type={commentStatusType(comment.status)} />
                        {reported && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                <Flag className="size-3" />
                                {comment.reportCount || comment.reportReasons?.length || 1}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(comment.createdAt).toLocaleString()}
                    </div>
                </div>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-foreground">
                {comment.content}
            </p>
            {(comment.rejectionReason || comment.blockReason || comment.reportReasons?.length) && (
                <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {comment.reportReasons?.length ? <div>Reports: {comment.reportReasons.join(', ')}</div> : null}
                    {comment.rejectionReason ? <div>Rejection: {comment.rejectionReason}</div> : null}
                    {comment.blockReason ? <div>Block: {comment.blockReason}</div> : null}
                </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    onClick={onApprove}
                    disabled={busy || comment.status === 'approved'}
                    title={approveDisabledReason || 'Approve comment'}
                    aria-describedby={actionStatusId}
                    data-testid={`blog-editor-approve-comment-${comment.id}`}
                    data-action-state={approveDisabledReason ? busy ? 'busy' : 'blocked' : 'ready'}
                    data-action-status={approveActionStatus}
                    data-disabled-reason={approveDisabledReason || undefined}
                    iconStart={<CheckCircle2 className="size-4" />}
                >
                    Approve
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onReject}
                    disabled={busy || comment.status === 'rejected'}
                    title={rejectDisabledReason || 'Reject comment'}
                    aria-describedby={actionStatusId}
                    data-testid={`blog-editor-reject-comment-${comment.id}`}
                    data-action-state={rejectDisabledReason ? busy ? 'busy' : 'blocked' : 'ready'}
                    data-action-status={rejectActionStatus}
                    data-disabled-reason={rejectDisabledReason || undefined}
                    iconStart={<XCircle className="size-4" />}
                >
                    Reject
                </Button>
            </div>
        </article>
    );
}

function commentStatusType(status: CommentModerationStatus) {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warning';
    if (status === 'rejected' || status === 'spam' || status === 'blocked') return 'error';
    return 'neutral';
}

interface TaxonomyPickerProps {
    title: string;
    emptyLabel: string;
    kind: 'category' | 'tag';
    items: Array<BlogCategory | BlogTag>;
    selectedIds: string[];
    onToggle: (id: string) => void;
    disabled?: boolean;
    disabledReason?: string;
    actionStatusId: string;
}

function TaxonomyPicker({ title, emptyLabel, kind, items, selectedIds, onToggle, disabled = false, disabledReason = '', actionStatusId }: TaxonomyPickerProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-muted-foreground">{title}</label>
                <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            </div>
            <div className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-border bg-background p-3">
                {items.length === 0 ? (
                    <span className="text-sm text-muted-foreground">{emptyLabel}</span>
                ) : items.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    const actionStatus = disabledReason
                        ? `${title} ${item.name} unavailable: ${disabledReason}`
                        : selected
                            ? `${title} ${item.name} selected.`
                            : `${title} ${item.name} available.`;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onToggle(item.id)}
                            disabled={disabled}
                            title={disabledReason || (selected ? `Remove ${item.name}` : `Select ${item.name}`)}
                            aria-pressed={selected}
                            aria-describedby={actionStatusId}
                            data-testid={`blog-editor-taxonomy-${kind}-${item.id}`}
                            data-action-state={disabledReason ? 'blocked' : selected ? 'selected' : 'ready'}
                            data-action-status={actionStatus}
                            data-disabled-reason={disabledReason || undefined}
                            className={cn(
                                'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                selected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                        >
                            {item.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

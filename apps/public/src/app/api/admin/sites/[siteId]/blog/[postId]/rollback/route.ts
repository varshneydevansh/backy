import { NextRequest, NextResponse } from "next/server";
import type { BackyJsonObject, Site } from "@backy-cms/core";
import { requireAdminAccess } from "@/lib/adminAccess";
import {
  getAdminBlogPostById,
  getSiteByIdOrSlug,
  rollbackAdminBlogPost,
} from "@/lib/backyStore";
import { recordSiteCacheInvalidation } from "@/lib/cacheInvalidation";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import {
  adminPostFromRepositoryPost,
  postRevisionSnapshot,
  postUpdateFromRevisionSnapshot,
  resolveRepositorySite,
} from "@/lib/repositoryContentWorkflow";
import { deliverSiteWebhooks } from "@/lib/siteWebhookDelivery";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
    postId: string;
  }>;
}

const makeRequestId = () =>
  `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  NextResponse.json(
    { success: false, requestId, error: { code, message } },
    { status },
  );

const parseJsonBody = async (
  request: NextRequest,
): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const postRollbackWebhookSnapshot = (post: {
  id: string;
  title: string;
  slug: string;
  status: string;
  author?: string | null;
  category?: string | null;
  tags?: string[];
  scheduledAt?: string | null;
  publishedAt?: string | null;
  updatedAt?: string;
}): BackyJsonObject => ({
  postId: post.id,
  title: post.title,
  slug: post.slug,
  status: post.status,
  author: post.author || null,
  category: post.category || null,
  tags: Array.isArray(post.tags) ? post.tags : [],
  scheduledAt: post.scheduledAt || null,
  publishedAt: post.publishedAt || null,
  updatedAt: post.updatedAt || null,
});

const deliverPostRollbackWebhook = async (params: {
  repositories?: Awaited<
    ReturnType<typeof getRequiredDatabaseRepositories>
  > | null;
  site: Site;
  before: Parameters<typeof postRollbackWebhookSnapshot>[0];
  after: Parameters<typeof postRollbackWebhookSnapshot>[0];
  revisionId: string;
  requestId: string;
  actor?: string | null;
}) =>
  deliverSiteWebhooks({
    repositories: params.repositories,
    site: params.site,
    kind: "site-updated",
    requestId: params.requestId,
    actor: params.actor,
    reason: "blog.post.rolledBack",
    data: {
      resourceType: "blogPost",
      before: postRollbackWebhookSnapshot(params.before),
      after: postRollbackWebhookSnapshot(params.after),
    },
    metadata: {
      action: "blog.post.rolledBack",
      changedKeys: ["content"],
      source: "admin-blog-rollback-api",
      resourceType: "blogPost",
      resourceId: params.after.id,
      slug: params.after.slug,
      status: params.after.status,
      revisionId: params.revisionId,
    },
  });

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.edit",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId, postId } = await params;
    const body = await parseJsonBody(request);
    const revisionId =
      typeof body.revisionId === "string" ? body.revisionId.trim() : "";

    if (!revisionId) {
      return errorResponse(
        400,
        "VALIDATION_ERROR",
        "revisionId is required",
        requestId,
      );
    }

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await resolveRepositorySite(repositories, siteId);

      if (!site) {
        return errorResponse(
          404,
          "SITE_NOT_FOUND",
          "Site not found",
          requestId,
        );
      }

      const currentPost = await repositories.posts.getById(site.id, postId);
      const revision = await repositories.contentWorkflows.getRevisionById(
        site.id,
        "post",
        postId,
        revisionId,
      );

      if (!currentPost || !revision) {
        return errorResponse(
          404,
          "REVISION_NOT_FOUND",
          "Post or revision not found",
          requestId,
        );
      }

      await repositories.contentWorkflows.createRevision({
        siteId: site.id,
        targetType: "post",
        targetId: currentPost.id,
        snapshot: postRevisionSnapshot(currentPost),
        note: `Before rollback to ${revisionId}`,
        operation: "rollback",
        restoreTargetRevisionId: revisionId,
        createdBy: request.headers.get("x-backy-actor") || "admin",
      });

      const rolledBack = await repositories.posts.update(
        site.id,
        currentPost.id,
        postUpdateFromRevisionSnapshot(revision.snapshot, currentPost),
      );
      const cacheInvalidation = await recordSiteCacheInvalidation(
        repositories,
        {
          siteId: site.id,
          scope: "content",
          entity: "post",
          entityId: rolledBack.item.id,
          reason: "post-rolled-back",
          requestId,
        },
      );
      await deliverPostRollbackWebhook({
        repositories,
        site,
        before: currentPost,
        after: rolledBack.item,
        revisionId,
        requestId,
        actor: access.session?.user.id,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          post: adminPostFromRepositoryPost(rolledBack.item),
          cacheInvalidation,
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);

    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const currentPost = getAdminBlogPostById(site.id, postId);
    const post = rollbackAdminBlogPost(
      site.id,
      postId,
      revisionId,
      request.headers.get("x-backy-actor") || "admin",
    );

    if (!post) {
      return errorResponse(
        404,
        "REVISION_NOT_FOUND",
        "Post or revision not found",
        requestId,
      );
    }
    await deliverPostRollbackWebhook({
      site: site as unknown as Site,
      before: currentPost || post,
      after: post,
      revisionId,
      requestId,
      actor: access.session?.user.id,
    });

    return NextResponse.json({ success: true, requestId, data: { post } });
  } catch (error) {
    console.error("Admin blog rollback API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

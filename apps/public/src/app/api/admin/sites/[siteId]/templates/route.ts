/**
 * Admin site template registry endpoint.
 *
 * GET /api/admin/sites/[siteId]/templates
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/adminAccess";
import { getSiteByIdOrSlug } from "@/lib/backyStore";
import { emptyFrontendDesignContract } from "@/lib/frontendDesignContract";
import {
  getRequiredDatabaseRepositories,
  shouldUseDemoStoreFallback,
} from "@/lib/repositoryRuntime";
import { buildTemplateRegistry } from "@/lib/templateRegistry";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{
    siteId: string;
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
    {
      success: false,
      requestId,
      error: { code, message },
    },
    { status },
  );

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get("x-request-id") || makeRequestId();
  const access = await requireAdminAccess(request, requestId, {
    permission: "pages.view",
  });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const search = searchParams.get("search");

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site =
        (await repositories.sites.getById(siteId)) ||
        (await repositories.sites.getBySlug(siteId));
      if (!site) {
        return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
      }

      const frontendDesign =
        site.settings?.frontendDesign || emptyFrontendDesignContract();
      const registry = buildTemplateRegistry(site.id, frontendDesign, {
        type,
        search,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: {
            id: site.id,
            slug: site.slug,
            name: site.name,
          },
          registry,
          templates: registry.templates,
          byType: registry.byType,
          endpoints: {
            frontendDesign: `/api/admin/sites/${site.id}/frontend-design`,
            templates: `/api/admin/sites/${site.id}/templates`,
          },
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, "SITE_NOT_FOUND", "Site not found", requestId);
    }

    const frontendDesign =
      site.settings?.frontendDesign || emptyFrontendDesignContract();
    const registry = buildTemplateRegistry(site.id, frontendDesign, {
      type,
      search,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: {
          id: site.id,
          slug: site.slug,
          name: site.name,
        },
        registry,
        templates: registry.templates,
        byType: registry.byType,
        endpoints: {
          frontendDesign: `/api/admin/sites/${site.id}/frontend-design`,
          templates: `/api/admin/sites/${site.id}/templates`,
        },
      },
    });
  } catch (error) {
    console.error("Admin template registry API error:", error);
    return errorResponse(
      500,
      "INTERNAL_SERVER_ERROR",
      "Internal server error",
      requestId,
    );
  }
}

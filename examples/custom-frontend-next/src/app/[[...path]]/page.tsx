import { notFound } from "next/navigation";

import type { BackyApiError, BackyRenderPayload } from "../../lib/backy-client";

import { backy, sitePublicHost } from "../../lib/backy";
import { BackyPage } from "../../lib/render";

type PageParams = {
  path?: string[];
};

function routePath(params: PageParams): string {
  const parts = params.path || [];
  return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }) {
  const path = routePath(await params);
  const rendered = await backy.render<BackyRenderPayload>(path, {
    sitePublicHost,
  });
  const seo = rendered.data.seo || {};

  return {
    title: typeof seo.title === "string" ? seo.title : rendered.data.site.name,
    description: typeof seo.description === "string" ? seo.description : undefined,
  };
}

export default async function CustomBackyPage({ params }: { params: Promise<PageParams> }) {
  const path = routePath(await params);

  try {
    const rendered = await backy.render<BackyRenderPayload>(path, {
      sitePublicHost,
      schemaVersion: "backy.content-payload.v1",
    });

    return <BackyPage payload={rendered.data} />;
  } catch (error) {
    const backyError = error as BackyApiError;
    if (backyError.status === 404) notFound();
    throw error;
  }
}

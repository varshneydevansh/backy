import { notFound } from "next/navigation";

import type { BackyApiError, BackyRenderPayload } from "../../lib/backy-client";

import { backy, sitePublicHost } from "../../lib/backy";
import { BackyBlogArchive } from "../../lib/blog";
import { BackyCheckout, BackyCheckoutResult } from "../../lib/checkout";
import { BackyPage } from "../../lib/render";

type PageParams = {
  path?: string[];
};

const checkoutPaths = new Set(["/checkout", "/checkout/success", "/checkout/cancel"]);

function routePath(params: PageParams): string {
  const parts = params.path || [];
  return parts.length > 0 ? `/${parts.join("/")}` : "/";
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }) {
  const path = routePath(await params);
  if (checkoutPaths.has(path)) {
    const manifest = await backy.manifest();
    return {
      title: `${path === "/checkout" ? "Checkout" : "Order status"} | ${manifest.data.site.name || "Backy site"}`,
      description: "Secure product order intake powered by Backy.",
    };
  }
  try {
    const rendered = await backy.render<BackyRenderPayload>(path, {
      sitePublicHost,
    });
    const seo = rendered.data.seo || {};

    return {
      title: typeof seo.title === "string" ? seo.title : rendered.data.site.name,
      description: typeof seo.description === "string" ? seo.description : undefined,
    };
  } catch (error) {
    const backyError = error as BackyApiError;
    if (path === "/blog" && backyError.status === 404) {
      const manifest = await backy.manifest();
      return {
        title: `Blog | ${manifest.data.site.name || "Backy site"}`,
        description: "Published reports, essays, notes, and updates.",
      };
    }
    throw error;
  }
}

export default async function CustomBackyPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const path = routePath(await params);

  if (checkoutPaths.has(path)) {
    const search = await searchParams;
    const orderReference = typeof search.order === "string" ? search.order : undefined;
    if (path === "/checkout/success" || path === "/checkout/cancel") {
      return <BackyCheckoutResult state={path.endsWith("success") ? "success" : "cancel"} orderReference={orderReference} />;
    }
    const initialProduct = typeof search.product === "string" ? search.product : undefined;
    const [catalog, contract, manifest] = await Promise.all([
      backy.commerceCatalog(),
      backy.commerceOrderContract(),
      backy.manifest(),
    ]);
    return <BackyCheckout catalog={catalog.data} contract={contract.data} initialProduct={initialProduct} siteName={manifest.data.site.name || "Store"} />;
  }

  try {
    const rendered = await backy.render<BackyRenderPayload>(path, {
      sitePublicHost,
      schemaVersion: "backy.content-payload.v1",
    });

    return <BackyPage payload={rendered.data} />;
  } catch (error) {
    const backyError = error as BackyApiError;
    if (backyError.status === 404 && path === "/blog") {
      const search = await searchParams;
      const query = typeof search.q === "string" ? search.q.trim() : "";
      const offset = typeof search.offset === "string" ? search.offset : "0";
      const [archive, manifest] = await Promise.all([
        backy.blogPosts({ search: query || undefined, limit: "12", offset }),
        backy.manifest(),
      ]);
      return <BackyBlogArchive archive={archive.data} siteId={manifest.data.site.id} query={query} />;
    }
    if (backyError.status === 404) notFound();
    throw error;
  }
}

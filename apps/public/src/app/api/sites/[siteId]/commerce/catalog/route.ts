/**
 * Public commerce catalog endpoint.
 *
 * GET /api/sites/[siteId]/commerce/catalog
 * GET /api/sites/[siteId]/commerce/catalog?slug=example
 */

import { NextRequest } from 'next/server';
import type { BackyCollectionRecord } from '@backy-cms/core';
import {
  PRODUCT_COLLECTION_SLUG,
  buildCommerceFacets,
  buildCommerceReadiness,
  buildCommerceStorefrontContract,
  filterCommerceProducts,
  isCommerceSourceRecord,
  productRecordToCommerceProduct,
} from '@/lib/commerceCatalog';
import { getAdminSettings, getCollectionByIdOrSlug, getSiteByIdOrSlug, listCollectionRecords } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string, details?: unknown) => (
  publicContractJson(
    { success: false, requestId, error: { code, message, details } },
    { status, requestId, cache: 'error' },
  )
);

const toBooleanFilter = (value: string | null): boolean | undefined => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
};

const hasPublicOrderCollectionAccess = (permissions: {
  publicRead?: boolean;
  publicCreate?: boolean;
  publicUpdate?: boolean;
  publicDelete?: boolean;
}) => (
  permissions.publicRead === true ||
  permissions.publicCreate === true ||
  permissions.publicUpdate === true ||
  permissions.publicDelete === true
);

const hasPrivateOrderIntake = (collection: {
  status?: string;
  permissions?: {
    publicRead?: boolean;
    publicCreate?: boolean;
    publicUpdate?: boolean;
    publicDelete?: boolean;
  };
} | null | undefined) => Boolean(
  collection &&
  collection.status === 'published' &&
  !hasPublicOrderCollectionAccess(collection.permissions || {}),
);

const paginationFor = (total: number, limit: number, offset: number) => ({
  total,
  limit,
  offset,
  hasMore: offset + limit < total,
});

const CATALOG_RECORD_PAGE_SIZE = 100;
const CATALOG_RECORD_MAX_PAGES = 1000;

type CatalogRecordListOptions = {
  search?: string;
  sortBy: string;
  sortDirection: 'asc' | 'desc';
};
type CommerceRepositories = Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>;

const listAllRepositoryCatalogRecords = async (
  repositories: CommerceRepositories,
  siteId: string,
  collectionId: string,
  options: CatalogRecordListOptions,
): Promise<BackyCollectionRecord[]> => {
  const records: BackyCollectionRecord[] = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < CATALOG_RECORD_MAX_PAGES; pageIndex += 1) {
    const page = await repositories.collections.listRecords({
      siteId,
      collectionId,
      includeUnpublished: true,
      status: 'all',
      search: options.search,
      sortBy: options.sortBy,
      sortDirection: options.sortDirection,
      limit: CATALOG_RECORD_PAGE_SIZE,
      offset,
    });

    records.push(...page.items);

    const nextOffset = page.pagination.offset + page.pagination.limit;
    if (!page.pagination.hasMore || nextOffset <= offset) {
      break;
    }

    offset = nextOffset;
  }

  return records;
};

const listAllDemoCatalogRecords = (
  siteId: string,
  collectionId: string,
  options: CatalogRecordListOptions,
) => {
  const records: ReturnType<typeof listCollectionRecords>['records'] = [];
  let offset = 0;

  for (let pageIndex = 0; pageIndex < CATALOG_RECORD_MAX_PAGES; pageIndex += 1) {
    const page = listCollectionRecords(siteId, collectionId, {
      search: options.search,
      sortBy: options.sortBy,
      sortDirection: options.sortDirection,
      limit: CATALOG_RECORD_PAGE_SIZE,
      offset,
    });

    records.push(...page.records);

    const nextOffset = page.pagination.offset + page.pagination.limit;
    if (!page.pagination.hasMore || nextOffset <= offset) {
      break;
    }

    offset = nextOffset;
  }

  return records;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 24)));
    const offset = Math.max(0, Number(searchParams.get('offset') || 0));
    const sortDirection = searchParams.get('sortDirection') === 'desc' ? 'desc' : 'asc';
    const sortBy = searchParams.get('sortBy') || 'title';
    const filters = {
      search: searchParams.get('q') || searchParams.get('search') || undefined,
      category: searchParams.get('category') || undefined,
      tag: searchParams.get('tag') || undefined,
      vendor: searchParams.get('vendor') || undefined,
      productType: searchParams.get('productType') || undefined,
      featured: toBooleanFilter(searchParams.get('featured')),
    };
    const slug = searchParams.get('slug') || undefined;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);

      if (!site || !site.isPublished) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const [collection, settings, ordersCollection] = await Promise.all([
        repositories.collections.getBySlug(site.id, PRODUCT_COLLECTION_SLUG),
        repositories.settings.get(),
        repositories.collections.getBySlug(site.id, 'orders'),
      ]);
      if (!collection || collection.status !== 'published' || !collection.permissions.publicRead) {
        return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
      }
      const commerce = buildCommerceStorefrontContract({
        siteId: site.id,
        settings: settings.integrations?.commerce,
        hasCatalog: true,
        hasOrderIntake: hasPrivateOrderIntake(ordersCollection),
      });

      const recordsPayload = slug
        ? {
            items: [
              await repositories.collections.getRecordBySlug(site.id, collection.id, slug),
            ].filter(Boolean),
          }
        : {
          items: await listAllRepositoryCatalogRecords(repositories, site.id, collection.id, {
            search: filters.search,
            sortBy,
            sortDirection,
          }),
        };
      const allProducts = recordsPayload.items.flatMap((record) => (
        isCommerceSourceRecord(record) ? [productRecordToCommerceProduct(record)] : []
      ));
      const filteredProducts = filterCommerceProducts(allProducts, filters);
      const products = slug ? filteredProducts : filteredProducts.slice(offset, offset + limit);

      if (slug && products.length === 0) {
        return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);
      }

      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'content',
      }) || undefined;

      return publicContractJson({
        success: true,
        requestId,
        data: {
          schemaVersion: 'backy.commerce-catalog.v1',
          collection,
          products,
          commerce,
          facets: buildCommerceFacets(allProducts),
          filters,
          readiness: buildCommerceReadiness(collection, allProducts),
          pagination: paginationFor(filteredProducts.length, slug ? products.length || 1 : limit, slug ? 0 : offset),
        },
        collection,
        products,
        commerce,
        facets: buildCommerceFacets(allProducts),
        pagination: paginationFor(filteredProducts.length, slug ? products.length || 1 : limit, slug ? 0 : offset),
      }, {
        requestId,
        request,
        cache: 'discovery',
        siteId: site.id,
        cacheRevision,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const collection = getCollectionByIdOrSlug(site.id, PRODUCT_COLLECTION_SLUG);
    if (!collection || collection.status !== 'published' || !collection.permissions.publicRead) {
      return errorResponse(404, 'PRODUCT_CATALOG_NOT_FOUND', 'Product catalog not found', requestId);
    }
    const ordersCollection = getCollectionByIdOrSlug(site.id, 'orders', { includeUnpublished: true });
    const commerce = buildCommerceStorefrontContract({
      siteId: site.id,
      settings: getAdminSettings().integrations?.commerce,
      hasCatalog: true,
      hasOrderIntake: hasPrivateOrderIntake(ordersCollection),
    });

    const recordsPayload = slug
      ? listCollectionRecords(site.id, collection.id, {
        slug,
        sortBy,
        sortDirection,
        limit: 1,
        offset: 0,
      })
      : {
        records: listAllDemoCatalogRecords(site.id, collection.id, {
          search: filters.search,
          sortBy,
          sortDirection,
        }),
      };
    const allProducts = recordsPayload.records.map((record) => productRecordToCommerceProduct(record));
    const filteredProducts = filterCommerceProducts(allProducts, filters);
    const products = slug ? filteredProducts : filteredProducts.slice(offset, offset + limit);

    if (slug && products.length === 0) {
      return errorResponse(404, 'PRODUCT_NOT_FOUND', 'Product not found', requestId);
    }

    return publicContractJson({
      success: true,
      requestId,
      data: {
        schemaVersion: 'backy.commerce-catalog.v1',
        collection,
        products,
        commerce,
        facets: buildCommerceFacets(allProducts),
        filters,
        readiness: buildCommerceReadiness(collection, allProducts),
        pagination: paginationFor(filteredProducts.length, slug ? products.length || 1 : limit, slug ? 0 : offset),
      },
      collection,
      products,
      commerce,
      facets: buildCommerceFacets(allProducts),
      pagination: paginationFor(filteredProducts.length, slug ? products.length || 1 : limit, slug ? 0 : offset),
    }, {
      requestId,
      request,
      cache: 'discovery',
      siteId: site.id,
    });
  } catch (error) {
    console.error('Public commerce catalog API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

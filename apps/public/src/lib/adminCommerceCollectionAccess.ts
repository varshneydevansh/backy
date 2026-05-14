import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAccess } from '@/lib/adminAccess';

type CommerceCollectionOperation = 'view' | 'edit' | 'delete' | 'configure';

const COMMERCE_COLLECTION_SLUGS = new Set(['products', 'orders']);

const commercePermissionByOperation: Record<CommerceCollectionOperation, string> = {
  view: 'commerce.view',
  edit: 'commerce.edit',
  delete: 'commerce.delete',
  configure: 'commerce.configure',
};

const normalizeSlug = (value: string) => value.trim().toLowerCase();

export const isCommerceCollectionSlug = (slug: string) => COMMERCE_COLLECTION_SLUGS.has(normalizeSlug(slug));

export const requireCommerceCollectionAccess = (
  request: NextRequest,
  requestId: string,
  collectionSlug: string,
  operation: CommerceCollectionOperation,
): NextResponse | null => {
  if (!isCommerceCollectionSlug(collectionSlug)) {
    return null;
  }

  const access = requireAdminAccess(request, requestId, {
    permission: commercePermissionByOperation[operation],
  });

  return access instanceof NextResponse ? access : null;
};

export const requireCommerceCollectionSlugAccess = (
  request: NextRequest,
  requestId: string,
  collectionSlugs: string[],
  operation: CommerceCollectionOperation,
): NextResponse | null => {
  const requiresCommercePermission = collectionSlugs.some(isCommerceCollectionSlug);
  if (!requiresCommercePermission) {
    return null;
  }

  const access = requireAdminAccess(request, requestId, {
    permission: commercePermissionByOperation[operation],
  });

  return access instanceof NextResponse ? access : null;
};

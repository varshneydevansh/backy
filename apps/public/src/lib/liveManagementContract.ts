import { NextResponse } from 'next/server';
import { withPublicContractHeaders } from '@/lib/publicContractResponse';

export type LiveManagementResource = 'page' | 'blog-post';

const liveManagementSchemaByResource: Record<LiveManagementResource, string> = {
  page: 'backy.live-management-page.v1',
  'blog-post': 'backy.live-management-blog-post.v1',
};

export const withLiveManagementContractHeaders = (
  response: NextResponse,
  options: {
    request: Request;
    requestId: string;
    siteId?: string;
    resource: LiveManagementResource;
  },
) => withPublicContractHeaders(response, {
  request: options.request,
  requestId: options.requestId,
  siteId: options.siteId,
  cache: 'private',
  schemaVersion: liveManagementSchemaByResource[options.resource],
  headers: {
    'x-backy-live-management': 'true',
    'x-backy-live-management-resource': options.resource,
  },
});

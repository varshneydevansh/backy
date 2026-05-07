import { NextResponse } from 'next/server';

export const BACKY_PUBLIC_CONTRACT_VERSION = 'backy.ai-frontend.v1';

export type PublicContractCacheScope = 'discovery' | 'render' | 'private' | 'error';

const cacheControlByScope: Record<PublicContractCacheScope, string> = {
  discovery: 'public, max-age=60, stale-while-revalidate=300',
  render: 'public, max-age=30, stale-while-revalidate=120',
  private: 'no-store',
  error: 'no-store',
};

export interface PublicContractResponseOptions {
  status?: number;
  requestId: string;
  cache: PublicContractCacheScope;
  contractVersion?: string;
  schemaVersion?: string;
  siteId?: string;
}

export const withPublicContractHeaders = (
  response: NextResponse,
  options: PublicContractResponseOptions,
) => {
  response.headers.set('cache-control', cacheControlByScope[options.cache]);
  response.headers.set('vary', 'Accept, Origin');
  response.headers.set('x-backy-cache-scope', options.cache);
  response.headers.set('x-backy-contract-version', options.contractVersion || BACKY_PUBLIC_CONTRACT_VERSION);
  response.headers.set('x-backy-request-id', options.requestId);

  if (options.schemaVersion) {
    response.headers.set('x-backy-schema-version', options.schemaVersion);
  }

  if (options.siteId) {
    response.headers.set('x-backy-site-id', options.siteId);
  }

  return response;
};

export const publicContractJson = <TBody>(
  body: TBody,
  options: PublicContractResponseOptions,
) => withPublicContractHeaders(
  NextResponse.json(body, { status: options.status }),
  options,
);

import { NextRequest } from 'next/server';
import { getFormById, getSiteByIdOrSlug } from '@/lib/backyStore';
import { publicContractJson } from '@/lib/publicContractResponse';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

interface RouteParams {
    params: Promise<{
        siteId: string;
        formId: string;
    }>;
}

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const formEndpoints = (request: NextRequest, siteId: string, formId: string) => {
    const baseUrl = new URL(request.url);
    const siteSegment = encodeURIComponent(siteId);
    const formSegment = encodeURIComponent(formId);

    return {
        definition: `${baseUrl.origin}/api/sites/${siteSegment}/forms/${formSegment}/definition`,
        submissions: `${baseUrl.origin}/api/sites/${siteSegment}/forms/${formSegment}/submissions`,
        contacts: `${baseUrl.origin}/api/sites/${siteSegment}/forms/${formSegment}/contacts`,
    };
};

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
    publicContractJson(
        {
            success: false,
            requestId,
            error: {
                code,
                message,
            },
            errorMessage: message,
        },
        { status, requestId, cache: 'error' },
    )
);

export async function GET(_request: NextRequest, { params }: RouteParams) {
    const requestId = _request.headers.get('x-request-id') || makeRequestId();

    try {
        const { siteId, formId } = await params;

        if (!shouldUseDemoStoreFallback()) {
            const repositories = await getRequiredDatabaseRepositories();
            const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
            if (!site || !site.isPublished) {
                return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
            }

            const form = await repositories.forms.getById(site.id, formId);
            if (!form || !form.isActive) {
                return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
            }

            const endpoints = formEndpoints(_request, site.id, form.id);

            return publicContractJson({
              success: true,
              requestId,
              data: {
                form,
                endpoints,
              },
              form,
              endpoints,
            }, {
              requestId,
              request: _request,
              cache: 'private',
              siteId: site.id,
            });
        }

        const site = getSiteByIdOrSlug(siteId);
        if (!site) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
        }

        const form = getFormById(site.id, formId);
        if (!form) {
            return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
        }

        const endpoints = formEndpoints(_request, site.id, form.id);

        return publicContractJson({
          success: true,
          requestId,
          data: {
            form,
            endpoints,
          },
          form,
          endpoints,
        }, {
          requestId,
          request: _request,
          cache: 'private',
          siteId: site.id,
        });
    } catch (error) {
        console.error('API Error:', error);
        return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
    }
}

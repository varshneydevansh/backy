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

const FORM_DEFINITION_SCHEMA_VERSION = 'backy.form-definition.v1';

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

const formDefinitionPayload = (siteId: string, form: unknown, requestId: string) => ({
  success: true,
  requestId,
  data: {
    schemaVersion: FORM_DEFINITION_SCHEMA_VERSION,
    form,
    submitUrl: `/api/sites/${siteId}/forms/${(form as { id: string }).id}/submissions`,
  },
  form,
  submitUrl: `/api/sites/${siteId}/forms/${(form as { id: string }).id}/submissions`,
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();

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

      const cacheRevision = await repositories.cacheInvalidations.latestRevision({
        siteId: site.id,
        scope: 'content',
      }) || undefined;

      return publicContractJson(formDefinitionPayload(site.id, form, requestId), {
        requestId,
        request,
        cache: 'discovery',
        schemaVersion: FORM_DEFINITION_SCHEMA_VERSION,
        siteId: site.id,
        cacheRevision,
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site || !site.isPublished) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const form = getFormById(site.id, formId);
    if (!form || form.isActive === false) {
      return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);
    }

    return publicContractJson(formDefinitionPayload(site.id, form, requestId), {
      requestId,
      request,
      cache: 'discovery',
      schemaVersion: FORM_DEFINITION_SCHEMA_VERSION,
      siteId: site.id,
    });
  } catch (error) {
    console.error('Form definition API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

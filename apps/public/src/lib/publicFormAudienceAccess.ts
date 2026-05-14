import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { publicContractJson } from '@/lib/publicContractResponse';

type FormAudienceAccessAction = 'definition' | 'submit';

type FormAudienceLike = {
  audience?: FormDefinition['audience'] | null;
};

const restrictedAudienceMessage = (audience: FormDefinition['audience']) => (
  audience === 'adminOnly'
    ? 'This form is only available to admins.'
    : 'This form requires an authenticated account.'
);

const restrictedAudienceCode = (audience: FormDefinition['audience']) => (
  audience === 'adminOnly' ? 'FORM_ADMIN_ONLY' : 'FORM_AUTHENTICATION_REQUIRED'
);

const formAudienceError = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) => publicContractJson(
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
);

export const isPublicFormAudience = (form: FormAudienceLike) => (
  !form.audience || form.audience === 'public'
);

export const filterPublicAudienceForms = <TForm extends FormAudienceLike>(forms: TForm[]) => (
  forms.filter(isPublicFormAudience)
);

export const requirePublicFormAudienceAccess = (
  request: NextRequest,
  requestId: string,
  form: FormAudienceLike,
  action: FormAudienceAccessAction,
): NextResponse | null => {
  if (isPublicFormAudience(form)) {
    return null;
  }

  const audience = form.audience || 'public';
  const permission = action === 'submit' && audience === 'adminOnly' ? 'forms.manage' : 'forms.view';
  const access = requireAdminAccess(request, requestId, { permission });

  if (!(access instanceof NextResponse)) {
    return null;
  }

  const status = access.status === 403 ? 403 : 401;
  return formAudienceError(
    status,
    restrictedAudienceCode(audience),
    restrictedAudienceMessage(audience),
    requestId,
  );
};

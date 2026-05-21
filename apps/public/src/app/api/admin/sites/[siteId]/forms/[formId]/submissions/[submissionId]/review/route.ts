import type { NextRequest } from 'next/server';
import { PATCH } from '../route';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    submissionId: string;
  }>;
}

export async function POST(request: NextRequest, context: RouteParams) {
  return PATCH(request, context);
}

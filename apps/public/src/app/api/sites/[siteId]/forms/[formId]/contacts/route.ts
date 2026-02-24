import { NextRequest, NextResponse } from 'next/server';
import {
  getFormById,
  getSiteByIdOrSlug,
  listFormContacts,
} from '@/lib/backyStore';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { siteId, formId } = await params;
    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const form = getFormById(site.id, formId);
    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') as string | null;
    const requestId = searchParams.get('requestId')?.trim() || undefined;
    const status = statusParam === 'new' || statusParam === 'contacted' || statusParam === 'qualified' || statusParam === 'archived'
      ? statusParam
      : undefined;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = listFormContacts(form.id, {
      status,
      requestId,
      limit: Number.isFinite(limit) ? limit : 20,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return NextResponse.json({
      formId: form.id,
      contacts: result.contacts,
      count: result.count,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

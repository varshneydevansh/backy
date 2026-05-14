import { NextRequest, NextResponse } from 'next/server';
import type { FormDefinition, FormSubmission } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, listFormsBySite, listFormSubmissions } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type FormSubmissionStatus = FormSubmission['status'];

interface FormAnalyticsSummary {
  forms: number;
  activeForms: number;
  inactiveForms: number;
  submissions: number;
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
  routedToCollections: number;
  conversionRate: number;
  spamRate: number;
}

interface FormAnalyticsTrendPoint {
  date: string;
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
}

interface FormAnalyticsFormBreakdown {
  formId: string;
  name: string;
  title: string | null;
  isActive: boolean;
  submissions: number;
  pending: number;
  approved: number;
  rejected: number;
  spam: number;
  routedToCollections: number;
  lastSubmittedAt: string | null;
}

const STATUSES: FormSubmissionStatus[] = ['pending', 'approved', 'rejected', 'spam'];
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const parseDays = (value: string | null): number => {
  const parsed = Number.parseInt(value || '14', 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(90, parsed)) : 14;
};

const emptyStatusCounts = () => ({
  pending: 0,
  approved: 0,
  rejected: 0,
  spam: 0,
});

const incrementStatus = (target: ReturnType<typeof emptyStatusCounts>, status: FormSubmissionStatus) => {
  if (status === 'approved') target.approved += 1;
  else if (status === 'rejected') target.rejected += 1;
  else if (status === 'spam') target.spam += 1;
  else target.pending += 1;
};

const dayKey = (value: string | null | undefined): string | null => {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
};

const trendSeed = (days: number): FormAnalyticsTrendPoint[] => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - (days - index - 1));
    return {
      date: date.toISOString().slice(0, 10),
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      spam: 0,
    };
  });
};

const submissionTimestamp = (submission: FormSubmission): number => {
  const timestamp = Date.parse(submission.submittedAt || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const fetchAllSubmissions = async (
  fetchPage: (offset: number) => Promise<{ items: FormSubmission[]; total: number; hasMore: boolean }>,
): Promise<FormSubmission[]> => {
  const submissions: FormSubmission[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await fetchPage(offset);
    submissions.push(...result.items);
    if (!result.hasMore || submissions.length >= result.total) break;
  }
  return submissions;
};

const buildAnalytics = (
  forms: FormDefinition[],
  submissions: FormSubmission[],
  days: number,
) => {
  const statusCounts = emptyStatusCounts();
  const trend = trendSeed(days);
  const trendByDate = new Map(trend.map((point) => [point.date, point]));
  const perForm = new Map<string, FormAnalyticsFormBreakdown>();

  forms.forEach((form) => {
    perForm.set(form.id, {
      formId: form.id,
      name: form.name,
      title: form.title || null,
      isActive: form.isActive,
      submissions: 0,
      ...emptyStatusCounts(),
      routedToCollections: 0,
      lastSubmittedAt: null,
    });
  });

  submissions.forEach((submission) => {
    const status = STATUSES.includes(submission.status) ? submission.status : 'pending';
    const form = perForm.get(submission.formId);
    incrementStatus(statusCounts, status);

    if (form) {
      form.submissions += 1;
      incrementStatus(form, status);
      if (submission.collectionRecord) form.routedToCollections += 1;
      if (!form.lastSubmittedAt || submissionTimestamp(submission) > Date.parse(form.lastSubmittedAt)) {
        form.lastSubmittedAt = submission.submittedAt;
      }
    }

    const date = dayKey(submission.submittedAt);
    const point = date ? trendByDate.get(date) : undefined;
    if (point) {
      point.total += 1;
      incrementStatus(point, status);
    }
  });

  const routedToCollections = submissions.filter((submission) => Boolean(submission.collectionRecord)).length;
  const summary: FormAnalyticsSummary = {
    forms: forms.length,
    activeForms: forms.filter((form) => form.isActive).length,
    inactiveForms: forms.filter((form) => !form.isActive).length,
    submissions: submissions.length,
    pending: statusCounts.pending,
    approved: statusCounts.approved,
    rejected: statusCounts.rejected,
    spam: statusCounts.spam,
    routedToCollections,
    conversionRate: submissions.length > 0 ? Math.round((statusCounts.approved / submissions.length) * 100) : 0,
    spamRate: submissions.length > 0 ? Math.round((statusCounts.spam / submissions.length) * 100) : 0,
  };

  return {
    summary,
    trend,
    forms: Array.from(perForm.values()).sort((a, b) => (
      b.submissions - a.submissions ||
      (Date.parse(b.lastSubmittedAt || '') || 0) - (Date.parse(a.lastSubmittedAt || '') || 0) ||
      a.name.localeCompare(b.name)
    )),
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const { siteId } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseDays(searchParams.get('days'));

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) {
        return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      }

      const formsResult = await repositories.forms.list({ siteId: site.id, limit: 100, offset: 0 });
      const forms = formsResult.items;
      const submissions = await fetchAllSubmissions(async (offset) => {
        const page = await repositories.forms.listSubmissions({
          siteId: site.id,
          limit: PAGE_LIMIT,
          offset,
        });
        return {
          items: page.items,
          total: page.pagination.total,
          hasMore: page.pagination.hasMore,
        };
      });
      const analytics = buildAnalytics(forms, submissions, days);

      return NextResponse.json({
        success: true,
        requestId,
        data: {
          site: { id: site.id, slug: site.slug, name: site.name },
          analytics,
          generatedAt: new Date().toISOString(),
        },
      });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) {
      return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    }

    const forms = listFormsBySite(site.id);
    const submissions = forms.flatMap((form) => (
      listFormSubmissions(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).data
    ));
    const analytics = buildAnalytics(forms, submissions, days);

    return NextResponse.json({
      success: true,
      requestId,
      data: {
        site: { id: site.id, slug: site.slug, name: site.name },
        analytics,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Admin forms analytics API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

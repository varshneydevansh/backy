import { FormEvent, useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  CircleCheck,
  CircleMinus,
  CircleSlash,
  Download,
  ExternalLink,
  Globe,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { useStore } from '@/stores/mockStore';
import { PageShell } from '@/components/layout/PageShell';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import type {
  Comment,
  Contact,
  FormDefinition,
  FormSubmission,
  CommentReportReason,
} from '@backy-cms/core';

interface SiteFormManagementState {
  forms: FormDefinition[];
  submissions: FormSubmission[];
  contacts: Contact[];
  comments: Comment[];
  submissionCount: number;
  contactCount: number;
  commentCount: number;
  submissionLoading: boolean;
  contactLoading: boolean;
  commentsLoading: boolean;
  workflowLoading: boolean;
  errorMessage: string | null;
  selectedFormId: string;
  selectedCommentIds: string[];
  commentReportReasons: CommentReportReason[];
}

type SubmissionStatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'spam';
type ContactStatusFilter = 'all' | 'new' | 'contacted' | 'qualified' | 'archived';
type CommentStatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'spam' | 'blocked';
type SiteStatusFilter = 'published' | 'draft' | 'archived';
type CommentTargetFilter = 'all' | 'page' | 'post';

const DEFAULT_COMMENT_REPORT_REASONS: CommentReportReason[] = [
  'spam',
  'harassment',
  'abuse',
  'hate-speech',
  'off-topic',
  'copyright',
  'privacy',
  'other',
];

const apiBase = (() => {
  const envBase = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_BACKY_PUBLIC_API_BASE_URL?.trim();
  return envBase ? envBase.replace(/\/$/, '') : '';
})();

function buildApiUrl(path: string): string {
  return `${apiBase}${path}`;
}

function formatTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}

function normalizeRequestIdInput(value: string): string {
  return value.trim();
}

function csvEscape(value: unknown): string {
  const raw = safeText(value).replace(/\r?\n/g, '\\n');
  return `"${raw.replace(/"/g, '""')}"`;
}

function makeCsvBlob(rows: string[][]): Blob {
  const csv = rows.map((line) => line.map(csvEscape).join(',')).join('\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute('/sites/$siteId')({
  component: EditSitePage,
});

function EditSitePage() {
  const navigate = useNavigate();
  const { siteId } = Route.useParams();
  const { sites, updateSite, deleteSite } = useStore();

  const site = sites.find((s) => s.id === siteId);
  const siteApiId = site?.publicSiteId || site?.slug || site?.id;

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    customDomain: '',
    description: '',
    status: 'draft',
  });

  const [state, setState] = useState<SiteFormManagementState>({
    forms: [],
    submissions: [],
    contacts: [],
    comments: [],
    submissionCount: 0,
    contactCount: 0,
    commentCount: 0,
    submissionLoading: false,
    contactLoading: false,
    commentsLoading: false,
    workflowLoading: false,
    errorMessage: null,
    selectedFormId: '',
    selectedCommentIds: [],
    commentReportReasons: [...DEFAULT_COMMENT_REPORT_REASONS],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatusFilter>('pending');
  const [contactStatus, setContactStatus] = useState<ContactStatusFilter>('all');
  const [commentStatus, setCommentStatus] = useState<CommentStatusFilter>('pending');
  const [commentSearch, setCommentSearch] = useState('');
  const [commentRequestId, setCommentRequestId] = useState('');
  const [commentTargetType, setCommentTargetType] = useState<CommentTargetFilter>('all');
  const [commentTargetId, setCommentTargetId] = useState('');
  const [commentBlockReason, setCommentBlockReason] = useState<CommentReportReason>(DEFAULT_COMMENT_REPORT_REASONS[0]);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (site) {
      setFormData({
        name: site.name,
        slug: site.slug,
        customDomain: site.customDomain || '',
        description: site.description,
        status: site.status as SiteStatusFilter,
      });
    }
  }, [site]);

  const setWorkflowLoading = (value: boolean) =>
    setState((prev) => ({ ...prev, workflowLoading: value }));

  const setWorkflowError = (message: string | null) =>
    setState((prev) => ({ ...prev, errorMessage: message }));

  const loadForms = async () => {
    if (!site || !siteApiId) return;
    setState((prev) => ({ ...prev, workflowLoading: true, errorMessage: null }));
    try {
      const response = await fetch(buildApiUrl(`/api/sites/${siteApiId}/forms`));
      if (!response.ok) {
        throw new Error('Unable to load form definitions.');
      }

      const payload = await response.json();
      const forms = Array.isArray(payload.forms) ? (payload.forms as FormDefinition[]) : [];
      const firstFormId = forms[0]?.id || '';
      setState((prev) => ({
        ...prev,
        forms,
        selectedFormId: forms.some((f) => f.id === prev.selectedFormId) ? prev.selectedFormId : firstFormId,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load forms.';
      setWorkflowError(message);
      setState((prev) => ({ ...prev, forms: [], selectedFormId: '' }));
    } finally {
      setState((prev) => ({ ...prev, workflowLoading: false }));
    }
  };

  const loadSubmissions = async (formId: string) => {
    if (!siteApiId || !formId) return;
    setState((prev) => ({ ...prev, submissionLoading: true, errorMessage: null }));
    try {
      const searchParams = new URLSearchParams();
      if (submissionStatus !== 'all') searchParams.set('status', submissionStatus);
      const requestId = normalizeRequestIdInput(commentRequestId);
      if (requestId) {
        searchParams.set('requestId', requestId);
      }
      const query = searchParams.toString();

      const response = await fetch(
        buildApiUrl(
          `/api/sites/${siteApiId}/forms/${formId}/submissions${query ? `?${query}` : ''}`,
        ),
      );
      if (!response.ok) {
        throw new Error('Unable to load form submissions.');
      }

      const payload = await response.json();
      const submissions = Array.isArray(payload?.submissions?.data)
        ? (payload.submissions.data as FormSubmission[])
        : [];
      const submissionCount = typeof payload?.submissions?.pagination?.total === 'number'
        ? payload.submissions.pagination.total
        : submissions.length;

      setState((prev) => ({
        ...prev,
        submissions,
        submissionCount,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load form submissions.';
      setState((prev) => ({ ...prev, submissions: [], submissionCount: 0 }));
      setWorkflowError(message);
    } finally {
      setState((prev) => ({ ...prev, submissionLoading: false }));
    }
  };

  const loadContacts = async (formId: string) => {
    if (!siteApiId || !formId) return;
    setState((prev) => ({ ...prev, contactLoading: true, errorMessage: null }));
    try {
      const searchParams = new URLSearchParams();
      if (contactStatus !== 'all') searchParams.set('status', contactStatus);
      const requestId = normalizeRequestIdInput(commentRequestId);
      if (requestId) {
        searchParams.set('requestId', requestId);
      }
      const query = searchParams.toString();

      const response = await fetch(
        buildApiUrl(
          `/api/sites/${siteApiId}/forms/${formId}/contacts${query ? `?${query}` : ''}`,
        ),
      );
      if (!response.ok) {
        throw new Error('Unable to load contacts.');
      }

      const payload = await response.json();
      const contacts = Array.isArray(payload?.contacts) ? (payload.contacts as Contact[]) : [];
      const contactCount = typeof payload?.count === 'number' ? payload.count : contacts.length;

      setState((prev) => ({
        ...prev,
        contacts,
        contactCount,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load contacts.';
      setState((prev) => ({ ...prev, contacts: [], contactCount: 0 }));
      setWorkflowError(message);
    } finally {
      setState((prev) => ({ ...prev, contactLoading: false }));
    }
  };

  const loadComments = async () => {
    if (!siteApiId) return;
    setState((prev) => ({ ...prev, commentsLoading: true, errorMessage: null }));
    try {
      const query = buildCommentFilterQuery();
      const response = await fetch(buildApiUrl(`/api/sites/${siteApiId}/comments?${query}`));
      if (!response.ok) {
        throw new Error('Unable to load comments.');
      }

      const payload = await response.json();
      const comments = Array.isArray(payload?.comments) ? (payload.comments as Comment[]) : [];
      const commentCount = typeof payload?.count === 'number' ? payload.count : comments.length;

      setState((prev) => ({
        ...prev,
        comments,
        commentCount,
        selectedCommentIds: [],
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load comments.';
      setState((prev) => ({ ...prev, comments: [], commentCount: 0, selectedCommentIds: [] }));
      setWorkflowError(message);
    } finally {
      setState((prev) => ({ ...prev, commentsLoading: false }));
    }
  };

  const buildCommentFilterQuery = () => {
    const searchParams = new URLSearchParams();
    if (commentTargetType !== 'all') {
      searchParams.set('targetType', commentTargetType);
    } else {
      searchParams.set('targetType', 'all');
    }

    if (commentStatus !== 'all') {
      searchParams.set('status', commentStatus);
    }

    const q = commentSearch.trim();
    if (q) searchParams.set('q', q);
    if (commentRequestId.trim()) searchParams.set('requestId', commentRequestId.trim());
    if (commentTargetId.trim()) searchParams.set('targetId', commentTargetId.trim());

    return searchParams.toString();
  };

  const loadCommentReportReasons = async () => {
    if (!siteApiId) return;
    try {
      const response = await fetch(buildApiUrl(`/api/sites/${siteApiId}/comments/report-reasons`));
      if (!response.ok) {
        return;
      }

      const payload = await response.json().catch(() => null);
      const reasons = Array.isArray(payload?.reasons) ? payload.reasons : [];
      const fallback = new Set(DEFAULT_COMMENT_REPORT_REASONS);
      const parsed = reasons
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is CommentReportReason =>
          value.length > 0 && fallback.has(value as CommentReportReason),
        );

      if (parsed.length === 0) {
        return;
      }

      setState((prev) => ({ ...prev, commentReportReasons: parsed }));
    } catch {
      // keep defaults
    }
  };

  const refreshWorkflow = async (formId?: string) => {
    if (!site || !siteApiId) return;
    const activeFormId = formId || state.selectedFormId;
    setWorkflowLoading(true);

    try {
      await loadForms();
      if (activeFormId) {
        await Promise.all([loadSubmissions(activeFormId), loadContacts(activeFormId)]);
      }
      await loadComments();
    } finally {
      setWorkflowLoading(false);
    }
  };

  const updateSubmissionStatus = async (
    submission: FormSubmission,
    status: FormSubmission['status'],
  ) => {
    if (!siteApiId || !state.selectedFormId) return;
    setActionBusyId(submission.id);
    try {
      const response = await fetch(
        buildApiUrl(
          `/api/sites/${siteApiId}/forms/${state.selectedFormId}/submissions/${submission.id}`,
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status,
            reviewedBy: 'admin',
            adminNotes: `Updated to ${status} from admin console`,
          }),
        },
      );
      if (!response.ok) {
        throw new Error('Unable to update submission status.');
      }
      await Promise.all([loadSubmissions(state.selectedFormId), loadContacts(state.selectedFormId)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update submission status.';
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const updateContactStatus = async (contact: Contact, status: Contact['status']) => {
    if (!siteApiId || !state.selectedFormId) return;
    setActionBusyId(contact.id);
    try {
      const response = await fetch(
        buildApiUrl(
          `/api/sites/${siteApiId}/forms/${state.selectedFormId}/contacts/${contact.id}`,
        ),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );
      if (!response.ok) {
        throw new Error('Unable to update contact status.');
      }
      await loadContacts(state.selectedFormId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update contact status.';
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const toggleCommentSelection = (commentId: string, checked: boolean) => {
    setState((prev) => ({
      ...prev,
      selectedCommentIds: checked
        ? Array.from(new Set([...prev.selectedCommentIds, commentId]))
        : prev.selectedCommentIds.filter((id) => id !== commentId),
    }));
  };

  const clearCommentSelection = () => {
    setState((prev) => ({ ...prev, selectedCommentIds: [] }));
  };

  const updateCommentStatus = async (
    comment: Comment,
    status: Comment['status'],
    blockReason?: string,
    requestId?: string,
  ) => {
    if (!siteApiId) return;
    setActionBusyId(comment.id);
    try {
      const effectiveRequestId = requestId?.trim() || comment.requestId || undefined;

      const response = await fetch(buildApiUrl(`/api/sites/${siteApiId}/comments/${comment.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          reviewedBy: 'admin',
          actor: 'admin',
          blockReason: blockReason,
          requestId: effectiveRequestId,
        }),
      });
      if (!response.ok) {
        throw new Error('Unable to update comment status.');
      }
      await loadComments();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update comment status.';
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const exportSubmissions = async () => {
    if (!state.selectedFormId || !siteApiId) return;

    const allSubmissions: FormSubmission[] = [];
    const limit = 200;
    const requestId = normalizeRequestIdInput(commentRequestId);
    let offset = 0;

    try {
      const baseQuery = new URLSearchParams({
        limit: `${limit}`,
      });
      if (submissionStatus !== 'all') baseQuery.set('status', submissionStatus);
      if (requestId) baseQuery.set('requestId', requestId);

      let hasMore = true;
      while (hasMore) {
        const query = new URLSearchParams(baseQuery);
        query.set('offset', `${offset}`);

        const response = await fetch(
          buildApiUrl(
            `/api/sites/${siteApiId}/forms/${state.selectedFormId}/submissions?${query.toString()}`,
          ),
        );
        if (!response.ok) {
          throw new Error('Unable to load submissions for export.');
        }

        const payload = await response.json();
        const submissions = Array.isArray(payload?.submissions?.data)
          ? (payload.submissions.data as FormSubmission[])
          : [];
        const count = typeof payload?.submissions?.pagination?.total === 'number'
          ? payload.submissions.pagination.total
          : submissions.length;

        allSubmissions.push(...submissions);
        hasMore = offset + submissions.length < count;
        offset += limit;

        if (submissions.length === 0) {
          break;
        }
      }

      if (!allSubmissions.length) return;

      const rows = [
        ['id', 'status', 'submittedAt', 'reviewedBy', 'adminNotes', 'pageId', 'postId', 'requestId', 'values'],
        ...allSubmissions.map((submission) => [
          submission.id,
          submission.status,
          submission.submittedAt,
          submission.reviewedBy || '',
          submission.adminNotes || '',
          submission.pageId || '',
          submission.postId || '',
          submission.requestId || '',
          safeText(submission.values),
        ]),
      ];
      const fileLabel =
        `submissions-${submissionStatus}-${requestId || 'all'}`;

      const blob = makeCsvBlob(rows);
      downloadBlob(`${fileLabel}.csv`, blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export form submissions.';
      setWorkflowError(message);
    }
  };

  const exportContacts = async () => {
    if (!state.selectedFormId || !siteApiId) return;

    const allContacts: Contact[] = [];
    const limit = 200;
    const requestId = normalizeRequestIdInput(commentRequestId);
    let offset = 0;

    try {
      const baseQuery = new URLSearchParams({
        limit: `${limit}`,
      });
      if (contactStatus !== 'all') baseQuery.set('status', contactStatus);
      if (requestId) baseQuery.set('requestId', requestId);

      let hasMore = true;
      while (hasMore) {
        const query = new URLSearchParams(baseQuery);
        query.set('offset', `${offset}`);

        const response = await fetch(
          buildApiUrl(
            `/api/sites/${siteApiId}/forms/${state.selectedFormId}/contacts?${query.toString()}`,
          ),
        );
        if (!response.ok) {
          throw new Error('Unable to load contacts for export.');
        }

        const payload = await response.json();
        const contacts = Array.isArray(payload?.contacts) ? (payload.contacts as Contact[]) : [];
        const count = typeof payload?.count === 'number' ? payload.count : contacts.length;

        allContacts.push(...contacts);
        hasMore = offset + contacts.length < count;
        offset += limit;

        if (contacts.length === 0) {
          break;
        }
      }

      if (!allContacts.length) return;

      const rows = [
        [
          'id',
          'status',
          'name',
          'email',
          'phone',
          'requestId',
          'sourceSubmissionId',
          'notes',
          'createdAt',
          'updatedAt',
        ],
        ...allContacts.map((contact) => [
          contact.id,
          contact.status,
          contact.name || '',
          contact.email || '',
          contact.phone || '',
          contact.requestId || '',
          contact.sourceSubmissionId || '',
          contact.notes || '',
          contact.createdAt,
          contact.updatedAt,
        ]),
      ];
      const fileLabel =
        `contacts-${contactStatus}-${requestId || 'all'}`;

      const blob = makeCsvBlob(rows);
      downloadBlob(`${fileLabel}.csv`, blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export contacts.';
      setWorkflowError(message);
    }
  };

  const exportComments = async () => {
    if (!siteApiId) return;
    const allComments: Comment[] = [];
    const limit = 200;
    let offset = 0;

    try {
      const baseQuery = buildCommentFilterQuery();
      let hasMore = true;

      while (hasMore) {
        const query = new URLSearchParams(baseQuery);
        query.set('limit', `${limit}`);
        query.set('offset', `${offset}`);

        const response = await fetch(buildApiUrl(`/api/sites/${siteApiId}/comments?${query.toString()}`));
        if (!response.ok) {
          throw new Error('Unable to load comments for export.');
        }

        const payload = await response.json();
        const comments = Array.isArray(payload?.comments) ? payload.comments : [];
        const count = typeof payload?.count === 'number' ? payload.count : comments.length;
        allComments.push(...comments);
        hasMore = offset + comments.length < count;
        offset += limit;

        if (comments.length === 0) {
          break;
        }
      }

      if (!allComments.length) return;

      const rows = [
        ['id', 'status', 'targetType', 'targetId', 'parentId', 'requestId', 'authorName', 'authorEmail', 'authorWebsite', 'reportCount', 'reportReasons', 'reviewedBy', 'blockReason', 'rejectionReason', 'createdAt'],
        ...allComments.map((comment) => [
          comment.id,
          comment.status,
          comment.targetType,
          comment.targetId,
          comment.parentId || '',
          comment.requestId || '',
          comment.authorName || '',
          comment.authorEmail || '',
          comment.authorWebsite || '',
          typeof comment.reportCount === 'number' ? String(comment.reportCount) : '0',
          Array.isArray(comment.reportReasons) ? comment.reportReasons.join(';') : '',
          comment.reviewedBy || '',
          comment.blockReason || '',
          comment.rejectionReason || '',
          comment.createdAt,
        ]),
      ];
      const blob = makeCsvBlob(rows);
      const fileLabel =
        commentStatus === 'all' && !commentRequestId ? 'comments' : `${commentStatus}-${commentRequestId || 'all'}`;
      downloadBlob(`${fileLabel}.csv`, blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export comments.';
      setWorkflowError(message);
    }
  };

  const applyBulkCommentAction = async (status: Comment['status']) => {
    if (!siteApiId || state.selectedCommentIds.length === 0) return;
    setActionBusyId('bulk-comment');
    try {
      const response = await fetch(buildApiUrl(`/api/sites/${siteApiId}/comments`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentIds: state.selectedCommentIds,
          status,
          reviewedBy: 'admin',
          actor: 'admin',
          blockReason: status === 'blocked' ? commentBlockReason : undefined,
          requestId: commentRequestId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to apply bulk comment moderation.');
      }

      await loadComments();
      clearCommentSelection();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to apply bulk comment moderation.';
      setWorkflowError(message);
    } finally {
      setActionBusyId(null);
    }
  };

  const exportCommentEvents = async () => {
    if (!siteApiId || !commentRequestId) return;
    try {
      const requestId = commentRequestId.trim();
      const allEvents: Array<{
        id: string;
        kind: string;
        status: string;
        target?: string;
        requestId?: string;
        formId?: string;
        submissionId?: string;
        commentId?: string;
        contactId?: string;
        reason?: string;
        actor?: string;
        statusCode?: number;
        error?: string;
        createdAt?: string;
      }> = [];
      const limit = 200;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          buildApiUrl(
            `/api/sites/${siteApiId}/events?${new URLSearchParams({
              requestId,
              limit: `${limit}`,
              offset: `${offset}`,
            }).toString()}`,
          ),
        );
        if (!response.ok) {
          throw new Error('Unable to load audit events.');
        }

        const payload = await response.json();
        const events = Array.isArray(payload?.events) ? payload.events : [];
        const count = typeof payload?.count === 'number' ? payload.count : events.length;
        allEvents.push(...events);
        hasMore = offset + events.length < count;
        offset += limit;

        if (events.length === 0) {
          break;
        }
      }

      if (!allEvents.length) return;

      const rows = [
        [
          'id',
          'kind',
          'status',
          'target',
          'requestId',
          'formId',
          'submissionId',
          'commentId',
          'contactId',
          'statusCode',
          'reason',
          'actor',
          'error',
          'createdAt',
        ],
        ...allEvents.map((event) => [
          event.id,
          event.kind,
          event.status,
          event.target,
          event.requestId || '',
          event.formId || '',
          event.submissionId || '',
          event.commentId || '',
          event.contactId || '',
          typeof event.statusCode === 'number' ? String(event.statusCode) : '',
          event.reason || '',
          event.actor || '',
          event.error || '',
          event.createdAt || '',
        ]),
      ];
      const blob = makeCsvBlob(rows);
      downloadBlob(`events-${commentRequestId}.csv`, blob);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to export events.';
      setWorkflowError(message);
    }
  };

  useEffect(() => {
    if (siteApiId) {
      void refreshWorkflow();
      void loadCommentReportReasons();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteApiId, submissionStatus, commentStatus, contactStatus, commentSearch, commentRequestId, commentTargetType, commentTargetId]);

  useEffect(() => {
    if (state.selectedFormId && siteApiId) {
      void loadSubmissions(state.selectedFormId);
      void loadContacts(state.selectedFormId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedFormId]);

  useEffect(() => {
    if (!state.commentReportReasons.length) {
      return;
    }

    if (!state.commentReportReasons.includes(commentBlockReason)) {
      setCommentBlockReason(state.commentReportReasons[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.commentReportReasons, commentBlockReason]);

  const activeForm = state.forms.find((form) => form.id === state.selectedFormId);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    updateSite(siteId, {
      name: formData.name,
      slug: formData.slug,
      customDomain: formData.customDomain || null,
      description: formData.description,
      status: formData.status,
    });

    navigate({ to: '/sites' });
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
      deleteSite(siteId);
      navigate({ to: '/sites' });
    }
  };

  if (!site) {
    return (
      <PageShell title="Site Not Found" description="The site you requested does not exist.">
        <button onClick={() => navigate({ to: '/sites' })} className="text-primary hover:underline">
          &larr; Back to Sites
        </button>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Edit ${site.name}`}
      description="Manage site settings and connected workflow."
      action={
        <button
          onClick={() => navigate({ to: '/sites' })}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      }
    >
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="bg-card border border-border rounded-xl p-6 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{site.name}</h3>
                <StatusBadge status={site.status} />
              </div>
              <a
                href={`https://${site.customDomain || `${site.slug}.backy.app`}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
              >
                {site.customDomain || `${site.slug}.backy.app`}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <button className="px-4 py-2 rounded-lg bg-accent hover:bg-accent/80 font-medium text-sm">
            Visit Site
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-6 shadow-sm">
            <div>
              <label className="block text-sm font-medium mb-2">Site Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">URL Slug</label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Custom Domain</label>
                <input
                  type="text"
                  value={formData.customDomain}
                  onChange={(e) => setFormData({ ...formData, customDomain: e.target.value })}
                  placeholder="e.g. mysite.com"
                  className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Visibility</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as SiteStatusFilter })}
                className="w-full px-4 py-2.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="draft">Draft (Private)</option>
                <option value="published">Published (Public)</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Site
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate({ to: '/sites' })}
                className="px-6 py-2.5 rounded-lg border hover:bg-accent font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className={cn(
                  'flex items-center gap-2 px-6 py-2.5 rounded-lg',
                  'bg-primary text-primary-foreground font-medium',
                  'hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md hover:shadow-lg',
                )}
              >
                <Save className="w-4 h-4" />
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>

        <section className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Site automation queues</h2>
              <p className="text-muted-foreground">
                Form submissions, contact capture, and comment moderation for this site.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => siteApiId ? void refreshWorkflow(state.selectedFormId) : undefined}
                className="px-3 py-2 rounded-lg border hover:bg-accent flex items-center gap-2"
                disabled={state.workflowLoading}
              >
                <RefreshCw className="w-4 h-4" />
                {state.workflowLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {!siteApiId ? (
            <p className="text-sm text-amber-600">
              No public API id is mapped for this site. Add `publicSiteId` in mock site to enable workflow management.
            </p>
          ) : (
            <>
              {state.errorMessage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-700 px-4 py-3">
                  {state.errorMessage}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Forms</h3>
                    <StatusBadge status={state.forms.length ? 'success' : 'warning'} />
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {state.workflowLoading ? 'Loading...' : `${state.forms.length} form(s) found`}
                  </p>
                  <div className="mt-3">
                    <label className="block text-sm font-medium mb-2">Active Form</label>
                    <select
                      value={state.selectedFormId}
                      onChange={(e) => {
                        setState((prev) => ({ ...prev, selectedFormId: e.target.value }));
                      }}
                      className="w-full px-3 py-2 rounded-lg border bg-background"
                    >
                      {state.forms.length === 0 ? (
                        <option value="">No forms available</option>
                      ) : (
                        state.forms.map((form) => (
                          <option key={form.id} value={form.id}>
                            {form.title || form.name} ({form.id})
                          </option>
                        ))
                      )}
                    </select>
                    <p className="text-xs text-muted-foreground mt-2">
                      {activeForm?.moderationMode
                        ? `Moderation mode: ${activeForm.moderationMode}`
                        : 'No moderation settings'}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Auto-Share Leads</span>
                    <StatusBadge
                      status={activeForm?.contactShare?.enabled ? 'success' : 'neutral'}
                      type={activeForm?.contactShare?.enabled ? 'success' : 'neutral'}
                    />
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Submission Queue</h3>
                    <StatusBadge status={submissionStatus} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="text-sm">
                      <span className="text-muted-foreground mr-2">Status</span>
                      <select
                        value={submissionStatus}
                        onChange={(e) =>
                          setSubmissionStatus(e.target.value as SubmissionStatusFilter)
                        }
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="spam">Spam</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Showing {state.submissions.length} / {state.submissionCount}
                    </span>
                    <button
                      onClick={exportSubmissions}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1"
                      disabled={!state.submissions.length}
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Contact Share Queue</h3>
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="mt-3">
                    <label className="text-sm text-muted-foreground">
                      <span>Status</span>
                      <select
                        value={contactStatus}
                        onChange={(e) => setContactStatus(e.target.value as ContactStatusFilter)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      >
                        <option value="all">All</option>
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="archived">Archived</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {state.contactCount} leads
                    </span>
                    <button
                      onClick={exportContacts}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1"
                      disabled={!state.contacts.length}
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Form Submissions</h3>
                    <button
                      type="button"
                      onClick={() => state.selectedFormId && loadSubmissions(state.selectedFormId)}
                      className="text-sm px-3 py-1.5 rounded-md border hover:bg-accent flex items-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Reload
                    </button>
                  </div>
                  {state.submissionLoading ? (
                    <div className="text-sm text-muted-foreground py-4">Loading submissions...</div>
                  ) : state.submissions.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                      No submissions in the selected state.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                            <tr>
                              <th className="text-left px-3 py-2">Time</th>
                              <th className="text-left px-3 py-2">Status</th>
                              <th className="text-left px-3 py-2">Target</th>
                              <th className="text-left px-3 py-2">Request ID</th>
                              <th className="text-left px-3 py-2">Values</th>
                              <th className="text-left px-3 py-2">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {state.submissions.map((submission) => (
                            <tr key={submission.id} className="border-t">
                              <td className="px-3 py-2">{formatTime(submission.submittedAt)}</td>
                              <td className="px-3 py-2">
                                <StatusBadge status={submission.status} />
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {submission.pageId || submission.postId || 'site'}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                {submission.requestId || '—'}
                              </td>
                              <td className="px-3 py-2 text-xs max-w-sm truncate">
                                {safeText(submission.values)}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => updateSubmissionStatus(submission, 'approved')}
                                    disabled={actionBusyId === submission.id}
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-1"
                                  >
                                    <CircleCheck className="w-3.5 h-3.5" />
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => updateSubmissionStatus(submission, 'rejected')}
                                    disabled={actionBusyId === submission.id}
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1"
                                  >
                                    <CircleMinus className="w-3.5 h-3.5" />
                                    Reject
                                  </button>
                                  <button
                                    onClick={() => updateSubmissionStatus(submission, 'spam')}
                                    disabled={actionBusyId === submission.id}
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-amber-50 hover:text-amber-700 flex items-center gap-1"
                                  >
                                    <CircleSlash className="w-3.5 h-3.5" />
                                    Mark spam
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Contacts (Lead Share)</h3>
                    <button
                      type="button"
                      onClick={() => state.selectedFormId && loadContacts(state.selectedFormId)}
                      className="text-sm px-3 py-1.5 rounded-md border hover:bg-accent flex items-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Reload
                    </button>
                  </div>
                  {state.contactLoading ? (
                    <div className="text-sm text-muted-foreground py-4">Loading contacts...</div>
                  ) : state.contacts.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                      No contacts in the selected state.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2">Name</th>
                            <th className="text-left px-3 py-2">Email</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="text-left px-3 py-2">Notes</th>
                            <th className="text-left px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {state.contacts.map((contact) => (
                            <tr key={contact.id} className="border-t">
                              <td className="px-3 py-2">
                                {contact.name || contact.phone || 'Unnamed'}
                              </td>
                              <td className="px-3 py-2">{contact.email || '—'}</td>
                              <td className="px-3 py-2">
                                <StatusBadge
                                  status={contact.status}
                                  type={
                                    contact.status === 'qualified'
                                      ? 'success'
                                      : contact.status === 'archived'
                                        ? 'neutral'
                                        : 'warning'
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 text-xs max-w-sm truncate">{contact.notes || '—'}</td>
                              <td className="px-3 py-2">
                                <div className="flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => updateContactStatus(contact, 'contacted')}
                                    disabled={actionBusyId === contact.id}
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700"
                                  >
                                    Mark contacted
                                  </button>
                                  <button
                                    onClick={() => updateContactStatus(contact, 'qualified')}
                                    disabled={actionBusyId === contact.id}
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-blue-50 hover:text-blue-700"
                                  >
                                    Mark qualified
                                  </button>
                                  <button
                                    onClick={() => updateContactStatus(contact, 'archived')}
                                    disabled={actionBusyId === contact.id}
                                    className="text-xs px-2 py-1 rounded-md border hover:bg-gray-50 hover:text-gray-700"
                                  >
                                    Archive
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Comments moderation</h3>
                    <div className="flex items-center gap-2">
                      {state.selectedCommentIds.length > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {state.selectedCommentIds.length} selected
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void exportComments()}
                        className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1"
                        disabled={!state.comments.length}
                      >
                        <Download className="w-3 h-3" />
                        Export comments (filtered)
                      </button>
                      <button
                        type="button"
                        onClick={() => void exportCommentEvents()}
                        className="text-xs px-2 py-1 rounded-md border hover:bg-accent flex items-center gap-1"
                        disabled={!commentRequestId}
                      >
                        <Download className="w-3 h-3" />
                        Export events (requestId)
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    <label className="text-sm text-muted-foreground">
                      <span>Status</span>
                      <select
                        value={commentStatus}
                        onChange={(e) => setCommentStatus(e.target.value as CommentStatusFilter)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      >
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="spam">Spam</option>
                        <option value="blocked">Blocked</option>
                      </select>
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Target</span>
                      <select
                        value={commentTargetType}
                        onChange={(e) => setCommentTargetType(e.target.value as CommentTargetFilter)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      >
                        <option value="all">All</option>
                        <option value="page">Page</option>
                        <option value="post">Post</option>
                      </select>
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Target ID</span>
                      <input
                        value={commentTargetId}
                        onChange={(event) => setCommentTargetId(event.target.value)}
                        placeholder="pageId / postId"
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      />
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Request ID</span>
                      <input
                        value={commentRequestId}
                        onChange={(event) => setCommentRequestId(event.target.value)}
                        placeholder="req_..."
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      />
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Block reason</span>
                      <select
                        value={commentBlockReason}
                        onChange={(event) => setCommentBlockReason(event.target.value as CommentReportReason)}
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      >
                        {state.commentReportReasons.map((reason) => (
                          <option key={reason} value={reason}>
                            {reason}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm text-muted-foreground">
                      <span>Search</span>
                      <input
                        value={commentSearch}
                        onChange={(event) => setCommentSearch(event.target.value)}
                        placeholder="author, email, text..."
                        className="w-full mt-1 px-3 py-2 rounded-lg border bg-background"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction('approved')}
                      disabled={!state.selectedCommentIds.length || actionBusyId === 'bulk-comment'}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-1"
                    >
                      <CircleCheck className="w-3.5 h-3.5" />
                      Approve selected
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction('rejected')}
                      disabled={!state.selectedCommentIds.length || actionBusyId === 'bulk-comment'}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1"
                    >
                      <CircleMinus className="w-3.5 h-3.5" />
                      Reject selected
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction('spam')}
                      disabled={!state.selectedCommentIds.length || actionBusyId === 'bulk-comment'}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-amber-50 hover:text-amber-700 flex items-center gap-1"
                    >
                      <CircleSlash className="w-3.5 h-3.5" />
                      Mark spam selected
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyBulkCommentAction('blocked')}
                      disabled={!state.selectedCommentIds.length || actionBusyId === 'bulk-comment'}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-red-50 hover:text-red-700 flex items-center gap-1"
                    >
                      <CircleSlash className="w-3.5 h-3.5" />
                      Block selected
                    </button>
                    <button
                      type="button"
                      onClick={clearCommentSelection}
                      disabled={!state.selectedCommentIds.length}
                      className="text-xs px-2 py-1 rounded-md border hover:bg-slate-50"
                    >
                      Clear selection
                    </button>
                  </div>
                  {state.commentsLoading ? (
                    <div className="text-sm text-muted-foreground py-4">Loading comments...</div>
                  ) : state.comments.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                      No comments in the selected state.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {state.comments.map((comment) => (
                        <div key={comment.id} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between gap-3">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={state.selectedCommentIds.includes(comment.id)}
                                onChange={(event) => toggleCommentSelection(comment.id, event.target.checked)}
                              />
                              <StatusBadge status={comment.status} />
                            </label>
                            <div>
                              <p className="text-sm">
                                <strong>{comment.authorName || 'Guest'}</strong>
                                {' '}
                                on
                                {' '}
                                {comment.targetType}/{comment.targetId}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatTime(comment.createdAt)} •
                                {' '}
                                {comment.authorEmail || comment.authorWebsite || 'No contact'}
                                {' '}
                                •
                                {' '}
                                {comment.requestId || 'No requestId'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Reports:
                                {' '}
                                {comment.reportCount || 0}
                                {' '}
                                •
                                {' '}
                                reasons:
                                {' '}
                                {(comment.reportReasons?.length ? comment.reportReasons : []).join(', ') || '—'}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm mt-2">{comment.content}</p>
                          {(comment.blockReason || comment.blockedBy || comment.blockedAt) ? (
                            <p className="text-xs text-amber-600 mt-1">
                              Blocked:
                              {' '}
                              {comment.blockReason || 'manual-block'}
                              {comment.blockedBy ? ` by ${comment.blockedBy}` : ''}
                              {comment.blockedAt ? ` at ${formatTime(comment.blockedAt)}` : ''}
                            </p>
                          ) : null}
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button
                              onClick={() =>
                                updateCommentStatus(comment, 'approved', undefined, commentRequestId || undefined)}
                              disabled={actionBusyId === comment.id}
                              className="text-xs px-2 py-1 rounded-md border hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-1"
                            >
                              <CircleCheck className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(comment, 'rejected', undefined, commentRequestId || undefined)}
                              disabled={actionBusyId === comment.id}
                              className="text-xs px-2 py-1 rounded-md border hover:bg-rose-50 hover:text-rose-700 flex items-center gap-1"
                            >
                              <CircleMinus className="w-3.5 h-3.5" />
                              Reject
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(comment, 'spam', undefined, commentRequestId || undefined)}
                              disabled={actionBusyId === comment.id}
                              className="text-xs px-2 py-1 rounded-md border hover:bg-amber-50 hover:text-amber-700 flex items-center gap-1"
                            >
                              <CircleSlash className="w-3.5 h-3.5" />
                              Mark spam
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(
                                  comment,
                                  'blocked',
                                  commentBlockReason,
                                  commentRequestId || undefined,
                                )}
                              disabled={actionBusyId === comment.id}
                              className="text-xs px-2 py-1 rounded-md border hover:bg-red-50 hover:text-red-700 flex items-center gap-1"
                            >
                              <CircleSlash className="w-3.5 h-3.5" />
                              Block
                            </button>
                            <button
                              onClick={() =>
                                updateCommentStatus(comment, 'pending', undefined, commentRequestId || undefined)}
                              disabled={actionBusyId === comment.id}
                              className="text-xs px-2 py-1 rounded-md border hover:bg-slate-100"
                            >
                              Reset to pending
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}

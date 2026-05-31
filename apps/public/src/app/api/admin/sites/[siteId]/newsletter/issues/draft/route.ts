import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { BackyPost, Contact, FormDefinition, Site } from '@backy-cms/core';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  getAdminBlogPostById,
  getSiteByIdOrSlug,
  listFormContacts,
  listFormsBySite,
} from '@/lib/backyStore';
import {
  buildNewsletterSummary,
  isNewsletterContact,
  isNewsletterForm,
  isNewsletterSubscriberSendable,
} from '@/lib/newsletterSubscribers';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type NewsletterIssueAudience = 'all' | 'sendable' | 'held';

type NewsletterIssueBuildBody = {
  postId?: unknown;
  audience?: unknown;
  recipientLimit?: unknown;
  subjectOverride?: unknown;
  preheaderOverride?: unknown;
  templateId?: unknown;
};

type IssuePost = Pick<
  BackyPost,
  | 'id'
  | 'siteId'
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'status'
  | 'content'
  | 'meta'
  | 'featuredImageId'
  | 'authorId'
  | 'categoryIds'
  | 'tagIds'
  | 'createdAt'
  | 'updatedAt'
  | 'publishedAt'
  | 'scheduledAt'
>;

const NEWSLETTER_ISSUE_DRAFT_SCHEMA_VERSION = 'backy.newsletter-issue-draft.v1';
const NEWSLETTER_ISSUE_SOURCE_SCHEMA_VERSION = 'backy.blog-newsletter-issue-source.v1';
const MAX_RECIPIENT_LIMIT = 100;
const PAGE_LIMIT = 100;
const MAX_PAGES = 100;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const parseBody = async (request: NextRequest): Promise<NewsletterIssueBuildBody> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const parseAudience = (value: unknown): NewsletterIssueAudience => {
  const normalized = textValue(value).toLowerCase();
  return normalized === 'all' || normalized === 'held' || normalized === 'sendable'
    ? normalized
    : 'sendable';
};

const parseRecipientLimit = (value: unknown): number => {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number.parseInt(value.trim(), 10)
      : MAX_RECIPIENT_LIMIT;
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), MAX_RECIPIENT_LIMIT)
    : MAX_RECIPIENT_LIMIT;
};

const buildPublicPath = (post: IssuePost) => `/blog/${post.slug}`;

const countElements = (elements: unknown): number => {
  if (!Array.isArray(elements)) return 0;
  return elements.reduce((total, element) => {
    if (!isRecord(element)) return total + 1;
    return total + 1 + countElements(element.children);
  }, 0);
};

const contentSummary = (post: IssuePost) => {
  const content: Record<string, unknown> = isRecord(post.content) ? post.content : {};
  const metadata: Record<string, unknown> = isRecord(content.metadata) ? content.metadata : {};
  const assets: Record<string, unknown> = isRecord(content.assets) ? content.assets : {};
  const media = Array.isArray(assets.media) ? assets.media : [];
  const fonts = Array.isArray(assets.fonts) ? assets.fonts : [];
  const animations = Array.isArray(metadata.animations) ? metadata.animations : [];
  const editableMap: Record<string, unknown> = isRecord(content.editableMap) ? content.editableMap : {};
  const dataBindings: Record<string, unknown> = isRecord(content.dataBindings) ? content.dataBindings : {};
  const datasets = Array.isArray(dataBindings.datasets) ? dataBindings.datasets : [];

  return {
    elementCount: countElements(content.elements),
    hasCanvasContent: countElements(content.elements) > 0,
    schemaVersion: textValue(content.schemaVersion) || null,
    mediaAssetCount: media.length,
    fontAssetCount: fonts.length,
    animationTimelineCount: animations.length,
    editableFieldCount: Object.keys(editableMap).length,
    dataBindingDatasetCount: datasets.length,
  };
};

const publicUrls = (origin: string, siteId: string, post: IssuePost) => {
  const path = buildPublicPath(post);
  return {
    path,
    publicPostBySlug: `${origin}/api/sites/${siteId}/blog?slug=${encodeURIComponent(post.slug)}`,
    publicRender: `${origin}/api/sites/${siteId}/render?path=${encodeURIComponent(path)}`,
    publicResolve: `${origin}/api/sites/${siteId}/resolve?path=${encodeURIComponent(path)}`,
  };
};

const recipientFilter = (audience: NewsletterIssueAudience) => (contact: Contact) => {
  const sendable = isNewsletterSubscriberSendable(contact);
  return audience === 'all' ? true : audience === 'sendable' ? sendable : !sendable;
};

const buildIssueDraft = (input: {
  origin: string;
  site: Pick<Site, 'id' | 'slug' | 'name'>;
  post: IssuePost;
  forms: FormDefinition[];
  contacts: Contact[];
  audience: NewsletterIssueAudience;
  recipientLimit: number;
  subjectOverride?: string;
  preheaderOverride?: string;
  templateId?: string;
  generatedAt: string;
}) => {
  const formById = new Map(input.forms.map((form) => [form.id, form]));
  const newsletterContacts = input.contacts.filter((contact) => (
    isNewsletterContact(contact, formById.get(contact.formId))
  ));
  const selectedRecipients = newsletterContacts.filter(recipientFilter(input.audience));
  const recipientIds = selectedRecipients.slice(0, input.recipientLimit).map((contact) => contact.id);
  const urls = publicUrls(input.origin, input.site.id, input.post);
  const subject = input.subjectOverride || input.post.title || 'Latest report';
  const preheader = input.preheaderOverride || input.post.excerpt || 'A new report is ready to send to subscribers.';
  const draftHash = createHash('sha256')
    .update([
      input.site.id,
      input.post.id,
      input.post.updatedAt,
      input.audience,
      input.recipientLimit,
      subject,
      preheader,
    ].join('|'))
    .digest('hex')
    .slice(0, 18);
  const summary = buildNewsletterSummary(newsletterContacts);
  const status = input.post.status !== 'published'
    ? 'needs-published-post'
    : selectedRecipients.length === 0
      ? 'needs-send-ready-subscribers'
      : 'ready-for-provider-draft';

  return {
    schemaVersion: NEWSLETTER_ISSUE_DRAFT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    issueDraft: {
      id: `issue_${draftHash}`,
      status,
      templateId: input.templateId || null,
      site: {
        id: input.site.id,
        slug: input.site.slug || null,
        name: input.site.name || null,
      },
      sourcePost: {
        schemaVersion: NEWSLETTER_ISSUE_SOURCE_SCHEMA_VERSION,
        id: input.post.id,
        title: input.post.title,
        slug: input.post.slug,
        excerpt: input.post.excerpt || '',
        path: urls.path,
        status: input.post.status,
        authorId: input.post.authorId || null,
        categoryIds: input.post.categoryIds || [],
        tagIds: input.post.tagIds || [],
        featuredImageId: input.post.featuredImageId || null,
        publishedAt: input.post.publishedAt || null,
        scheduledAt: input.post.scheduledAt || null,
        updatedAt: input.post.updatedAt,
        contentSummary: contentSummary(input.post),
      },
      copy: {
        subject,
        preheader,
        suggestedSections: [
          'Lead report summary',
          'Why it matters',
          'Evidence and source links',
          'Correction or contact note',
          'Provider-managed unsubscribe footer',
        ],
      },
      urls,
      audience: {
        requested: input.audience,
        recipientLimit: input.recipientLimit,
        selectedRecipientCount: recipientIds.length,
        selectedRecipientIds: recipientIds,
        totalMatchedRecipients: selectedRecipients.length,
        totalSubscribers: summary.total,
        sendReadySubscribers: summary.sendReady,
        heldOrSuppressed: summary.held,
        unsubscribedOrArchived: summary.unsubscribed + summary.archivedContacts,
      },
      syncContract: {
        subscriberListUrl: `/api/admin/sites/${input.site.id}/newsletter/subscribers?audience=${input.audience}&limit=${input.recipientLimit}`,
        sendReadySubscriberListUrl: `/api/admin/sites/${input.site.id}/newsletter/subscribers?audience=sendable&limit=${input.recipientLimit}`,
        contactSyncTemplate: `/api/admin/sites/${input.site.id}/forms/{formId}/contacts/sync`,
        requiredAdminPermission: 'forms.export',
        noRawEmailsInIssueDraft: true,
      },
      providerBoundary: {
        status: 'external-delivery-required',
        canBuildDraftInBacky: true,
        canSendEmailInBacky: false,
        keepSecretServerSide: ['provider API keys', 'SMTP credentials', 'unsubscribe signing secrets', 'bounce webhook secrets'],
        deliveryProviderScope: ['bulk delivery', 'unsubscribe enforcement', 'bounce handling', 'complaint handling', 'SPF/DKIM/DMARC', 'sender reputation'],
      },
    },
    handoff: {
      agentHandoff: `/api/sites/${input.site.id}/agent-handoff`,
      manifest: `/api/sites/${input.site.id}/manifest`,
      openapi: `/api/sites/${input.site.id}/openapi`,
      newsletterWorkspace: `/newsletter?siteId=${input.site.id}#newsletter-issue-handoff`,
      blogEditor: `/blog/${input.post.id}?siteId=${input.site.id}#blog-editor-newsletter`,
    },
  };
};

const fetchRepositoryForms = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
): Promise<FormDefinition[]> => {
  const forms: FormDefinition[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await repositories.forms.list({ siteId, limit: PAGE_LIMIT, offset });
    forms.push(...result.items);
    if (!result.pagination.hasMore || forms.length >= result.pagination.total) break;
  }
  return forms;
};

const fetchRepositoryContacts = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
  forms: FormDefinition[],
): Promise<Contact[]> => {
  const contacts: Contact[] = [];
  for (const form of forms) {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_LIMIT;
      const result = await repositories.forms.listContacts({ siteId, formId: form.id, limit: PAGE_LIMIT, offset });
      contacts.push(...result.items);
      if (!result.pagination.hasMore || offset + result.items.length >= result.pagination.total) break;
    }
  }
  return contacts;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = await requireAdminAccess(request, requestId, { permission: 'forms.export' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const body = await parseBody(request);
    const postId = textValue(body.postId);
    if (!postId) return errorResponse(400, 'INVALID_NEWSLETTER_ISSUE_POST_ID', 'postId is required to build a newsletter issue draft.', requestId);

    const audience = parseAudience(body.audience);
    const recipientLimit = parseRecipientLimit(body.recipientLimit);
    const subjectOverride = textValue(body.subjectOverride);
    const preheaderOverride = textValue(body.preheaderOverride);
    const templateId = textValue(body.templateId);
    const generatedAt = new Date().toISOString();
    const origin = new URL(request.url).origin;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
      const post = await repositories.posts.getById(site.id, postId);
      if (!post) return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
      const forms = (await fetchRepositoryForms(repositories, site.id)).filter(isNewsletterForm);
      const contacts = await fetchRepositoryContacts(repositories, site.id, forms);
      const issueDraft = buildIssueDraft({
        origin,
        site,
        post,
        forms,
        contacts,
        audience,
        recipientLimit,
        subjectOverride,
        preheaderOverride,
        templateId,
        generatedAt,
      });
      return NextResponse.json({ success: true, requestId, data: issueDraft, issueDraft: issueDraft.issueDraft });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    const post = getAdminBlogPostById(site.id, postId) as IssuePost | undefined;
    if (!post) return errorResponse(404, 'POST_NOT_FOUND', 'Post not found', requestId);
    const forms = listFormsBySite(site.id).filter(isNewsletterForm);
    const contacts = forms.flatMap((form) => listFormContacts(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).contacts);
    const issueDraft = buildIssueDraft({
      origin,
      site,
      post,
      forms,
      contacts,
      audience,
      recipientLimit,
      subjectOverride,
      preheaderOverride,
      templateId,
      generatedAt,
    });
    return NextResponse.json({ success: true, requestId, data: issueDraft, issueDraft: issueDraft.issueDraft });
  } catch (error) {
    console.error('Admin newsletter issue draft build API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

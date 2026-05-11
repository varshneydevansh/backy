import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SITE_SETTINGS, type BackyJsonObject, type Contact, type FormDefinition, type SiteContactSavedList, type SiteContactSavedListFilters, type SiteSettings } from '@backy-cms/core';
import { recordAdminAudit } from '@/lib/adminAudit';
import { requireAdminAccess } from '@/lib/adminAccess';
import { getSiteByIdOrSlug, listFormContacts, listFormsBySite, updateAdminSite } from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
  }>;
}

type ContactListPayload = {
  id?: string;
  name?: string;
  description?: string | null;
  filters?: SiteContactSavedListFilters;
  listId?: string;
};

const PAGE_LIMIT = 100;
const MAX_PAGES = 100;
const CONTACT_STATUSES = ['all', 'new', 'contacted', 'qualified', 'archived'] as const;
const CONTACT_QUALITIES = ['all', 'missing-email', 'missing-phone', 'needs-notes', 'has-source-values', 'ready-to-promote', 'duplicate-email'] as const;

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const normalizeIdentifier = (value: string | null | undefined) => value?.trim().toLowerCase() || '';

const createListId = (name: string) => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'list';
  return `contact-list-${slug}-${Date.now().toString(36)}`;
};

const normalizeFilters = (value: unknown): SiteContactSavedListFilters => {
  const record = isRecord(value) ? value : {};
  const status = CONTACT_STATUSES.includes(record.status as (typeof CONTACT_STATUSES)[number])
    ? record.status as SiteContactSavedListFilters['status']
    : 'all';
  const quality = CONTACT_QUALITIES.includes(record.quality as (typeof CONTACT_QUALITIES)[number])
    ? record.quality as SiteContactSavedListFilters['quality']
    : 'all';
  const formId = textValue(record.formId) || 'all';
  const query = textValue(record.query);

  return {
    formId,
    status,
    quality,
    ...(query ? { query } : {}),
  };
};

const normalizeSavedLists = (settings: SiteSettings): SiteContactSavedList[] => (
  Array.isArray(settings.contacts?.savedLists)
    ? settings.contacts.savedLists
        .filter((list): list is SiteContactSavedList => isRecord(list) && typeof list.id === 'string' && typeof list.name === 'string')
        .map((list) => ({
          id: textValue(list.id),
          name: textValue(list.name) || 'Saved lead list',
          description: textValue(list.description) || null,
          filters: normalizeFilters(list.filters),
          createdAt: textValue(list.createdAt) || new Date().toISOString(),
          updatedAt: textValue(list.updatedAt) || textValue(list.createdAt) || new Date().toISOString(),
        }))
    : []
);

const siteSettings = (settings: SiteSettings | undefined): SiteSettings => (
  (settings || DEFAULT_SITE_SETTINGS) as SiteSettings
);

const auditMetadata = (requestId: string, filters?: SiteContactSavedListFilters): BackyJsonObject => ({
  requestId,
  ...(filters ? { filters: { ...filters } as BackyJsonObject } : {}),
});

const nextSettingsWithLists = (settings: SiteSettings, savedLists: SiteContactSavedList[]): SiteSettings => ({
  ...settings,
  contacts: {
    ...(settings.contacts || {}),
    savedLists,
  },
});

const duplicateEmailSet = (contacts: Contact[]) => {
  const groups = new Map<string, Contact[]>();
  contacts.forEach((contact) => {
    const email = normalizeIdentifier(contact.email);
    if (!email || contact.status === 'archived') return;
    groups.set(email, [...(groups.get(email) || []), contact]);
  });

  return new Set(Array.from(groups.entries()).filter(([, group]) => group.length > 1).map(([email]) => email));
};

const filterContactsForList = (
  contacts: Contact[],
  forms: FormDefinition[],
  filters: SiteContactSavedListFilters,
): Contact[] => {
  const duplicates = duplicateEmailSet(contacts);
  const formById = new Map(forms.map((form) => [form.id, form]));
  const query = filters.query?.trim().toLowerCase() || '';

  return contacts.filter((contact) => {
    if (filters.formId && filters.formId !== 'all' && contact.formId !== filters.formId) return false;
    if (filters.status && filters.status !== 'all' && contact.status !== filters.status) return false;

    const hasEmail = Boolean(contact.email?.trim());
    const hasPhone = Boolean(contact.phone?.trim());
    const hasNotes = Boolean(contact.notes?.trim());
    const hasSourceValues = Boolean(contact.sourceValues && Object.keys(contact.sourceValues).length > 0);
    const quality = filters.quality || 'all';
    if (quality === 'missing-email' && hasEmail) return false;
    if (quality === 'missing-phone' && hasPhone) return false;
    if (quality === 'needs-notes' && hasNotes) return false;
    if (quality === 'has-source-values' && !hasSourceValues) return false;
    if (quality === 'ready-to-promote' && (contact.status !== 'qualified' || !hasEmail)) return false;
    if (quality === 'duplicate-email' && !duplicates.has(normalizeIdentifier(contact.email))) return false;

    if (!query) return true;
    const form = formById.get(contact.formId);
    return [
      contact.name,
      contact.email,
      contact.phone,
      contact.notes,
      contact.requestId,
      form?.title,
      form?.name,
    ].some((entry) => String(entry || '').toLowerCase().includes(query));
  });
};

const buildListResponse = (savedLists: SiteContactSavedList[], forms: FormDefinition[], contacts: Contact[]) => (
  savedLists.map((list) => {
    const matched = filterContactsForList(contacts, forms, list.filters);
    return {
      ...list,
      matchedCount: matched.length,
      contactIds: matched.map((contact) => contact.id),
      formIds: Array.from(new Set(matched.map((contact) => contact.formId))).sort((left, right) => left.localeCompare(right)),
    };
  })
);

const fetchRepositoryContacts = async (
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
  siteId: string,
) => {
  const contacts: Contact[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_LIMIT;
    const result = await repositories.forms.listContacts({ siteId, limit: PAGE_LIMIT, offset });
    contacts.push(...result.items);
    if (!result.pagination.hasMore || contacts.length >= result.pagination.total) break;
  }
  return contacts;
};

const parseJsonBody = async (request: NextRequest): Promise<ContactListPayload> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.view' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const forms = (await repositories.forms.list({ siteId: site.id, limit: PAGE_LIMIT, offset: 0 })).items;
      const contacts = await fetchRepositoryContacts(repositories, site.id);
      const savedLists = normalizeSavedLists(siteSettings(site.settings));
      const lists = buildListResponse(savedLists, forms, contacts);

      return NextResponse.json({ success: true, requestId, data: { lists, count: lists.length }, lists });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const forms = listFormsBySite(site.id);
    const contacts = forms.flatMap((form) => listFormContacts(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).contacts);
    const savedLists = normalizeSavedLists(siteSettings(site.settings));
    const lists = buildListResponse(savedLists, forms, contacts);

    return NextResponse.json({ success: true, requestId, data: { lists, count: lists.length }, lists });
  } catch (error) {
    console.error('Admin contact lists API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const now = new Date().toISOString();
    const name = textValue(body.name);
    if (!name) return errorResponse(400, 'VALIDATION_ERROR', 'Saved list requires a name.', requestId);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const settings = siteSettings(site.settings);
      const savedLists = normalizeSavedLists(settings);
      const existing = body.id ? savedLists.find((list) => list.id === body.id) : undefined;
      const list: SiteContactSavedList = {
        id: existing?.id || createListId(name),
        name,
        description: body.description === undefined ? existing?.description || null : textValue(body.description) || null,
        filters: normalizeFilters(body.filters || existing?.filters),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      const nextLists = existing ? savedLists.map((item) => (item.id === list.id ? list : item)) : [list, ...savedLists];
      const updated = await repositories.sites.update(site.id, { settings: nextSettingsWithLists(settings, nextLists) });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'settings',
        entityId: list.id,
        action: existing ? 'contactList.update' : 'contactList.create',
        before: existing,
        after: list,
        metadata: auditMetadata(requestId, list.filters),
        requestId,
      });
      const forms = (await repositories.forms.list({ siteId: site.id, limit: PAGE_LIMIT, offset: 0 })).items;
      const contacts = await fetchRepositoryContacts(repositories, site.id);
      const lists = buildListResponse(normalizeSavedLists(siteSettings(updated.item.settings)), forms, contacts);

      return NextResponse.json({ success: true, requestId, data: { list, lists, created: !existing, updated: Boolean(existing) }, list, lists }, { status: existing ? 200 : 201 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const settings = siteSettings(site.settings);
    const savedLists = normalizeSavedLists(settings);
    const existing = body.id ? savedLists.find((list) => list.id === body.id) : undefined;
    const list: SiteContactSavedList = {
      id: existing?.id || createListId(name),
      name,
      description: body.description === undefined ? existing?.description || null : textValue(body.description) || null,
      filters: normalizeFilters(body.filters || existing?.filters),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const nextLists = existing ? savedLists.map((item) => (item.id === list.id ? list : item)) : [list, ...savedLists];
    const updated = updateAdminSite(site.id, { settings: nextSettingsWithLists(settings, nextLists) });
    if (!updated) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    await recordAdminAudit({
      siteId: site.id,
      actorId: access.session?.user.id,
      entity: 'settings',
      entityId: list.id,
      action: existing ? 'contactList.update' : 'contactList.create',
      before: existing,
      after: list,
      metadata: auditMetadata(requestId, list.filters),
      requestId,
    });
    const forms = listFormsBySite(site.id);
    const contacts = forms.flatMap((form) => listFormContacts(form.id, { limit: PAGE_LIMIT * MAX_PAGES, offset: 0 }).contacts);
    const lists = buildListResponse(normalizeSavedLists(siteSettings(updated.settings)), forms, contacts);

    return NextResponse.json({ success: true, requestId, data: { list, lists, created: !existing, updated: Boolean(existing) }, list, lists }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error('Admin contact list save API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const access = requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (access instanceof NextResponse) return access;

  try {
    const { siteId } = await params;
    const body = await parseJsonBody(request);
    const listId = textValue(body.listId || body.id);
    if (!listId) return errorResponse(400, 'VALIDATION_ERROR', 'Saved list id is required.', requestId);

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const settings = siteSettings(site.settings);
      const savedLists = normalizeSavedLists(settings);
      const removed = savedLists.find((list) => list.id === listId);
      const nextLists = savedLists.filter((list) => list.id !== listId);
      await repositories.sites.update(site.id, { settings: nextSettingsWithLists(settings, nextLists) });
      if (removed) {
        await recordAdminAudit({
          repositories,
          siteId: site.id,
          actorId: access.session?.user.id,
          entity: 'settings',
          entityId: listId,
          action: 'contactList.delete',
          before: removed,
          metadata: auditMetadata(requestId),
          requestId,
        });
      }

      return NextResponse.json({ success: true, requestId, data: { deleted: Boolean(removed), listId } });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const settings = siteSettings(site.settings);
    const savedLists = normalizeSavedLists(settings);
    const removed = savedLists.find((list) => list.id === listId);
    const updated = updateAdminSite(site.id, { settings: nextSettingsWithLists(settings, savedLists.filter((list) => list.id !== listId)) });
    if (!updated) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);
    if (removed) {
      await recordAdminAudit({
        siteId: site.id,
        actorId: access.session?.user.id,
        entity: 'settings',
        entityId: listId,
        action: 'contactList.delete',
        before: removed,
        metadata: auditMetadata(requestId),
        requestId,
      });
    }

    return NextResponse.json({ success: true, requestId, data: { deleted: Boolean(removed), listId } });
  } catch (error) {
    console.error('Admin contact list delete API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

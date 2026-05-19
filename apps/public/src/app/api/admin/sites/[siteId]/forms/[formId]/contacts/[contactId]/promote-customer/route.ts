import { NextRequest, NextResponse } from 'next/server';
import type {
  BackyCollection,
  BackyCollectionField,
  BackyCollectionRecord,
  BackyJsonObject,
  BackyJsonValue,
  Contact,
} from '@backy-cms/core';
import { recordAdminAudit } from '@/lib/adminAudit';
import { requireAdminAccess } from '@/lib/adminAccess';
import {
  createAdminCollection,
  createAdminCollectionRecord,
  getCollectionByIdOrSlug,
  getContactById,
  getFormById,
  getSiteByIdOrSlug,
  listCollectionRecords,
  updateAdminCollection,
  updateAdminCollectionRecord,
  updateContactStatus,
} from '@/lib/backyStore';
import { getRequiredDatabaseRepositories, shouldUseDemoStoreFallback } from '@/lib/repositoryRuntime';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{
    siteId: string;
    formId: string;
    contactId: string;
  }>;
}

const CUSTOMER_COLLECTION_SLUG = 'customers';
const CUSTOMER_PROMOTION_SOURCE_KEY = '__backyCustomerPromotion';
const CUSTOMER_STATUSES = ['lead', 'customer', 'vip', 'inactive'] as const;

type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
type ParsedCustomerPromotionValue<TValue> = { value: TValue; invalid?: true };

const makeRequestId = () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorResponse = (status: number, code: string, message: string, requestId: string) => (
  NextResponse.json({ success: false, requestId, error: { code, message }, errorMessage: message }, { status })
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const normalizeEmail = (value: unknown): string => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

const normalizeSlug = (value: unknown): string => (
  typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : ''
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const parseCustomerStatus = (value: unknown): ParsedCustomerPromotionValue<CustomerStatus> => {
  if (value === undefined || value === null || value === '') return { value: 'lead' };
  const status = typeof value === 'string' ? value.trim() : '';
  return CUSTOMER_STATUSES.includes(status as CustomerStatus)
    ? { value: status as CustomerStatus }
    : { value: 'lead', invalid: true };
};

const parseJsonBody = async (request: NextRequest): Promise<Record<string, unknown>> => {
  try {
    const body = await request.json();
    return isRecord(body) ? body : {};
  } catch {
    return {};
  }
};

const auditMetadata = (value: Record<string, unknown>): BackyJsonObject => value as BackyJsonObject;

const customerFields = (): BackyCollectionField[] => [
  { id: 'field-customer-name', key: 'name', label: 'Name', type: 'text', required: true },
  { id: 'field-customer-email', key: 'email', label: 'Email', type: 'email', required: true, unique: true },
  { id: 'field-customer-phone', key: 'phone', label: 'Phone', type: 'text' },
  { id: 'field-customer-status', key: 'status', label: 'Status', type: 'select', options: [...CUSTOMER_STATUSES] },
  { id: 'field-customer-source', key: 'source', label: 'Source', type: 'text' },
  { id: 'field-customer-contact-id', key: 'contactid', label: 'Contact ID', type: 'text' },
  { id: 'field-customer-form-id', key: 'formid', label: 'Form ID', type: 'text' },
  { id: 'field-customer-notes', key: 'notes', label: 'Notes', type: 'richText' },
  { id: 'field-customer-source-values', key: 'sourcevalues', label: 'Source Values', type: 'json' },
];

type CollectionFieldInput = {
  id: string;
  key: string;
  label: string;
  type: BackyCollectionField['type'];
  required?: boolean;
  unique?: boolean;
  options?: string[];
  referenceCollectionId?: string | null;
  defaultValue?: unknown;
  validation?: BackyJsonObject;
};

const normalizeFieldForInput = (field: CollectionFieldInput): BackyCollectionField => {
  const next: BackyCollectionField = {
    id: field.id,
    key: field.key,
    label: field.label,
    type: field.type,
    ...(field.required !== undefined ? { required: field.required } : {}),
    ...(field.unique !== undefined ? { unique: field.unique } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(field.referenceCollectionId ? { referenceCollectionId: field.referenceCollectionId } : {}),
    ...(field.validation ? { validation: field.validation } : {}),
    ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue as BackyJsonValue } : {}),
  };
  return next;
};

const ensureCustomerFields = (collection: { fields: CollectionFieldInput[] }): BackyCollectionField[] => {
  const existingKeys = new Set(collection.fields.map((field) => field.key));
  const missingFields = customerFields().filter((field) => !existingKeys.has(field.key));
  const normalizedFields = collection.fields.map(normalizeFieldForInput);
  return missingFields.length > 0 ? [...normalizedFields, ...missingFields] : normalizedFields;
};

const customerCollectionInput = () => ({
  name: 'Customers',
  slug: CUSTOMER_COLLECTION_SLUG,
  description: 'Private customer profiles promoted from Backy contacts and commerce workflows.',
  status: 'draft',
  listRoutePattern: '/customers',
  routePattern: '/customers/:recordSlug',
  fields: customerFields(),
  permissions: {
    publicRead: false,
    publicCreate: false,
    publicUpdate: false,
    publicDelete: false,
  },
  metadata: {
    schemaVersion: 'backy.customers.v1',
    source: 'contacts-promotion',
  },
});

const customerRecordValues = (
  contact: Contact,
  input: Record<string, unknown>,
  customerStatus: CustomerStatus,
): Record<string, BackyJsonValue> => ({
  name: (textValue(input.name) || contact.name || contact.email || 'Customer') as BackyJsonValue,
  email: normalizeEmail(contact.email) as BackyJsonValue,
  phone: (textValue(input.phone) || contact.phone || '') as BackyJsonValue,
  status: customerStatus as BackyJsonValue,
  source: 'contact-promotion',
  contactid: contact.id,
  formid: contact.formId,
  notes: (textValue(input.notes) || contact.notes || '') as BackyJsonValue,
  sourcevalues: (isRecord(contact.sourceValues) ? contact.sourceValues : {}) as BackyJsonValue,
});

const customerSlug = (email: string): string => (
  normalizeSlug(email.replace('@', '-at-')) || `customer-${Date.now().toString(36)}`
);

const appendPromotionNote = (notes: string | null | undefined, recordId: string, existingRecord: boolean): string => {
  const suffix = `Promoted to ${existingRecord ? 'existing' : 'new'} customer record ${recordId}.`;
  const current = notes?.trim() || '';
  return current.includes(suffix) ? current : [current, suffix].filter(Boolean).join('\n');
};

const promotionSourceValues = (
  contact: Contact,
  input: {
    collectionId: string;
    collectionSlug: string;
    recordId: string;
    recordSlug: string;
    email: string;
    existingRecord: boolean;
    createdCollection: boolean;
    promotedAt: string;
    requestId: string;
  },
): Record<string, unknown> => ({
  ...(isRecord(contact.sourceValues) ? contact.sourceValues : {}),
  [CUSTOMER_PROMOTION_SOURCE_KEY]: {
    target: 'customer',
    collectionId: input.collectionId,
    collectionSlug: input.collectionSlug,
    recordId: input.recordId,
    recordSlug: input.recordSlug,
    email: input.email,
    existingRecord: input.existingRecord,
    createdCollection: input.createdCollection,
    promotedAt: input.promotedAt,
    requestId: input.requestId,
  },
});

const findRepositoryCustomerByEmail = async (
  collection: BackyCollection,
  siteId: string,
  email: string,
  repositories: Awaited<ReturnType<typeof getRequiredDatabaseRepositories>>,
): Promise<BackyCollectionRecord | null> => {
  const result = await repositories.collections.listRecords({
    siteId,
    collectionId: collection.id,
    includeUnpublished: true,
    fieldKey: 'email',
    fieldValue: email,
    limit: 100,
    offset: 0,
  });
  return result.items.find((record) => normalizeEmail(record.values.email) === email) || null;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  const requestId = request.headers.get('x-request-id') || makeRequestId();
  const formAccess = await requireAdminAccess(request, requestId, { permission: 'forms.manage' });
  if (formAccess instanceof NextResponse) return formAccess;
  const collectionAccess = await requireAdminAccess(request, requestId, { permission: 'collections.edit' });
  if (collectionAccess instanceof NextResponse) return collectionAccess;

  try {
    const { siteId, formId, contactId } = await params;
    const body = await parseJsonBody(request);
    const customerStatusFilter = parseCustomerStatus(body.customerStatus);
    if (customerStatusFilter.invalid) {
      return errorResponse(400, 'INVALID_ADMIN_CUSTOMER_PROMOTION_STATUS', 'customerStatus must be lead, customer, vip, or inactive.', requestId);
    }
    const customerStatus = customerStatusFilter.value;

    if (!shouldUseDemoStoreFallback()) {
      const repositories = await getRequiredDatabaseRepositories();
      const site = await repositories.sites.getById(siteId) || await repositories.sites.getBySlug(siteId);
      if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

      const form = await repositories.forms.getById(site.id, formId);
      if (!form) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);

      const contact = await repositories.forms.getContactById(site.id, form.id, contactId);
      if (!contact) return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
      if (contact.status !== 'qualified') {
        return errorResponse(409, 'CONTACT_NOT_QUALIFIED', 'Mark this contact qualified before promoting it.', requestId);
      }

      const email = normalizeEmail(contact.email);
      if (!email || !email.includes('@')) {
        return errorResponse(400, 'CONTACT_MISSING_EMAIL', 'Promoting a contact to customer requires a valid contact email.', requestId);
      }

      const collectionInput = customerCollectionInput();
      const existingCollection = await repositories.collections.getBySlug(site.id, CUSTOMER_COLLECTION_SLUG);
      const createdCollection = !existingCollection;
      const collection = existingCollection || (await repositories.collections.create({
        siteId: site.id,
        name: collectionInput.name,
        slug: collectionInput.slug,
        description: collectionInput.description,
        status: 'draft',
        routePattern: collectionInput.routePattern,
        listRoutePattern: collectionInput.listRoutePattern,
        fields: collectionInput.fields,
        permissions: collectionInput.permissions,
        metadata: collectionInput.metadata as BackyJsonObject,
      })).item;
      const ensuredFields = ensureCustomerFields(collection);
      const customerCollection = ensuredFields.length === collection.fields.length
        ? collection
        : (await repositories.collections.update(site.id, collection.id, {
          fields: ensuredFields,
          metadata: {
            ...(isRecord(collection.metadata) ? collection.metadata : {}),
            schemaVersion: 'backy.customers.v1',
            source: 'contacts-promotion',
          } as BackyJsonObject,
        })).item;
      const existingRecord = await findRepositoryCustomerByEmail(customerCollection, site.id, email, repositories);
      const values = customerRecordValues(contact, body, customerStatus);
      const record = existingRecord
        ? (await repositories.collections.updateRecord(site.id, customerCollection.id, existingRecord.id, {
          values: {
            ...existingRecord.values,
            ...values,
          },
          status: existingRecord.status,
        })).item
        : (await repositories.collections.createRecord({
          siteId: site.id,
          collectionId: customerCollection.id,
          slug: customerSlug(email),
          status: 'draft',
          values,
        })).item;
      const promotedAt = new Date().toISOString();
      const updatedContact = (await repositories.forms.updateContact(site.id, contact.id, {
        notes: appendPromotionNote(contact.notes, record.id, Boolean(existingRecord)),
        sourceValues: promotionSourceValues(contact, {
          collectionId: customerCollection.id,
          collectionSlug: customerCollection.slug,
          recordId: record.id,
          recordSlug: record.slug,
          email,
          existingRecord: Boolean(existingRecord),
          createdCollection,
          promotedAt,
          requestId,
        }),
      })).item;

      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: formAccess.session?.user.id,
        entity: 'collectionRecord',
        entityId: record.id,
        action: existingRecord ? 'customer.update_from_contact' : 'customer.create_from_contact',
        before: existingRecord || undefined,
        after: record,
        metadata: auditMetadata({ contactId: contact.id, collectionId: customerCollection.id, email, createdCollection }),
        requestId,
      });
      await recordAdminAudit({
        repositories,
        siteId: site.id,
        actorId: formAccess.session?.user.id,
        entity: 'contact',
        entityId: contact.id,
        action: 'contact.promote.customer',
        before: contact,
        after: updatedContact,
        metadata: auditMetadata({ collectionId: customerCollection.id, recordId: record.id, email, existingRecord: Boolean(existingRecord), createdCollection }),
        requestId,
      });

      return NextResponse.json({
        success: true,
        requestId,
        data: { contact: updatedContact, collection: customerCollection, record, existingRecord: Boolean(existingRecord), createdCollection },
        contact: updatedContact,
        collection: customerCollection,
        record,
      }, { status: existingRecord ? 200 : 201 });
    }

    const site = getSiteByIdOrSlug(siteId);
    if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Site not found', requestId);

    const form = getFormById(site.id, formId);
    if (!form) return errorResponse(404, 'FORM_NOT_FOUND', 'Form not found', requestId);

    const contact = getContactById(contactId);
    if (!contact || contact.siteId !== site.id || contact.formId !== form.id) {
      return errorResponse(404, 'CONTACT_NOT_FOUND', 'Contact not found', requestId);
    }
    if (contact.status !== 'qualified') {
      return errorResponse(409, 'CONTACT_NOT_QUALIFIED', 'Mark this contact qualified before promoting it.', requestId);
    }

    const email = normalizeEmail(contact.email);
    if (!email || !email.includes('@')) {
      return errorResponse(400, 'CONTACT_MISSING_EMAIL', 'Promoting a contact to customer requires a valid contact email.', requestId);
    }

    const existingCollection = getCollectionByIdOrSlug(site.id, CUSTOMER_COLLECTION_SLUG, { includeUnpublished: true });
    const createdCollection = !existingCollection;
    const collection = existingCollection || createAdminCollection(site.id, customerCollectionInput());
    const ensuredFields = ensureCustomerFields(collection);
    const customerCollection = ensuredFields.length === collection.fields.length
      ? collection
      : updateAdminCollection(site.id, collection.id, {
        fields: ensuredFields,
        metadata: {
          ...(isRecord(collection.metadata) ? collection.metadata : {}),
          schemaVersion: 'backy.customers.v1',
          source: 'contacts-promotion',
        },
      });
    if (!customerCollection) {
      return errorResponse(409, 'CUSTOMER_COLLECTION_FAILED', 'Unable to prepare customer collection.', requestId);
    }
    const customerRecords = listCollectionRecords(site.id, customerCollection.id, {
      includeUnpublished: true,
      fieldKey: 'email',
      fieldValue: email,
      limit: 100,
      offset: 0,
    }).records;
    const existingRecord = customerRecords.find((record) => normalizeEmail(record.values.email) === email);
    const values = customerRecordValues(contact, body, customerStatus);
    const record = existingRecord
      ? updateAdminCollectionRecord(site.id, customerCollection.id, existingRecord.id, {
        values: {
          ...existingRecord.values,
          ...values,
        },
        status: existingRecord.status,
      })
      : createAdminCollectionRecord(site.id, customerCollection.id, {
        slug: customerSlug(email),
        status: 'draft',
        values,
      });
    if (!record) {
      return errorResponse(409, 'CUSTOMER_RECORD_FAILED', 'Unable to create or update customer record.', requestId);
    }

    const promotedAt = new Date().toISOString();
    const updatedContact = updateContactStatus(contact.id, {
      notes: appendPromotionNote(contact.notes, record.id, Boolean(existingRecord)),
      sourceValues: promotionSourceValues(contact, {
        collectionId: customerCollection.id,
        collectionSlug: customerCollection.slug,
        recordId: record.id,
        recordSlug: record.slug,
        email,
        existingRecord: Boolean(existingRecord),
        createdCollection,
        promotedAt,
        requestId,
      }),
    });
    if (!updatedContact) {
      return errorResponse(409, 'CONTACT_UPDATE_FAILED', 'Unable to update promoted contact.', requestId);
    }

    await recordAdminAudit({
      siteId: site.id,
      actorId: formAccess.session?.user.id,
      entity: 'collectionRecord',
      entityId: record.id,
      action: existingRecord ? 'customer.update_from_contact' : 'customer.create_from_contact',
      before: existingRecord || undefined,
      after: record,
      metadata: auditMetadata({ contactId: contact.id, collectionId: customerCollection.id, email, createdCollection }),
      requestId,
    });
    await recordAdminAudit({
      siteId: site.id,
      actorId: formAccess.session?.user.id,
      entity: 'contact',
      entityId: contact.id,
      action: 'contact.promote.customer',
      before: contact,
      after: updatedContact,
      metadata: auditMetadata({ collectionId: customerCollection.id, recordId: record.id, email, existingRecord: Boolean(existingRecord), createdCollection }),
      requestId,
    });

    return NextResponse.json({
      success: true,
      requestId,
      data: { contact: updatedContact, collection: customerCollection, record, existingRecord: Boolean(existingRecord), createdCollection },
      contact: updatedContact,
      collection: customerCollection,
      record,
    }, { status: existingRecord ? 200 : 201 });
  } catch (error) {
    console.error('Admin contact customer promotion API error:', error);
    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Internal server error', requestId);
  }
}

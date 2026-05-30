import type { Contact, FormDefinition, NewsletterSubscriptionStatus as CoreNewsletterSubscriptionStatus } from '@backy-cms/core';

export const NEWSLETTER_FORM_SCHEMA_VERSION = 'backy.newsletter-form.v1';
export const NEWSLETTER_SUBSCRIBERS_SCHEMA_VERSION = 'backy.newsletter-subscribers.v1';
export const NEWSLETTER_SUBSCRIBE_SCHEMA_VERSION = 'backy.newsletter-subscribe.v1';

export type NewsletterSubscriptionStatus = Extract<CoreNewsletterSubscriptionStatus, 'subscribed' | 'unsubscribed'>;
export type NewsletterOperationalStatus = CoreNewsletterSubscriptionStatus;

type NewsletterSourceInput = {
  existingSourceValues?: Record<string, unknown>;
  status: NewsletterSubscriptionStatus;
  topics?: string | null;
  source?: string | null;
  consent?: boolean;
  consentText?: string | null;
  requestId?: string | null;
  now?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const textValue = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const booleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'on'].includes(normalized)) return true;
    if (['false', 'no', '0', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

const readRecordString = (record: Record<string, unknown>, key: string): string => (
  textValue(record[key])
);

const NEWSLETTER_OPERATIONAL_STATUSES = new Set<NewsletterOperationalStatus>([
  'subscribed',
  'unsubscribed',
  'pending',
  'bounced',
  'complained',
]);

const toNewsletterOperationalStatus = (value: unknown): NewsletterOperationalStatus | null => {
  const normalized = textValue(value).toLowerCase();
  return NEWSLETTER_OPERATIONAL_STATUSES.has(normalized as NewsletterOperationalStatus)
    ? normalized as NewsletterOperationalStatus
    : null;
};

export const isNewsletterForm = (form: FormDefinition): boolean => {
  const settings = isRecord(form.settings) ? form.settings : {};
  const subscriptionManagement = isRecord(settings.subscriptionManagement)
    ? settings.subscriptionManagement
    : {};
  const haystack = [
    form.name,
    form.title,
    form.description,
    form.successMessage,
    readRecordString(settings, 'backyIntent'),
    readRecordString(settings, 'schemaVersion'),
    readRecordString(settings, 'source'),
    readRecordString(settings, 'templateId'),
    readRecordString(subscriptionManagement, 'statusField'),
    readRecordString(subscriptionManagement, 'topicField'),
    ...form.fields.map((field) => `${field.key} ${field.label}`),
  ].join(' ').toLowerCase();

  return (
    haystack.includes('newsletter')
    || haystack.includes('subscriber')
    || haystack.includes('publication')
    || readRecordString(settings, 'backyIntent') === 'newsletter'
    || readRecordString(settings, 'schemaVersion') === NEWSLETTER_FORM_SCHEMA_VERSION
    || Boolean(form.contactShare?.enabled && form.contactShare.notesField === 'topics')
  );
};

export const readContactSourceValue = (contact: Contact, key: string): string => {
  const source = isRecord(contact.sourceValues) ? contact.sourceValues : {};
  const exact = source[key];
  const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matched = Object.entries(source).find(([entryKey]) => (
    entryKey.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey
  ));
  return formatSourceValue(exact ?? matched?.[1]);
};

export const newsletterOperationalStatusFromContact = (contact: Contact): NewsletterOperationalStatus => {
  const storedStatus = toNewsletterOperationalStatus(contact.newsletterSubscriptionStatus);
  if (storedStatus) return storedStatus;

  const source = isRecord(contact.sourceValues) ? contact.sourceValues : {};
  const newsletter = isRecord(source.newsletter) ? source.newsletter : {};
  const rawStatus = [
    textValue(newsletter.status),
    textValue(source.newsletterStatus),
    textValue(source.subscriptionStatus),
    textValue(source.status),
  ].find(Boolean)?.toLowerCase();

  if (
    rawStatus === 'unsubscribed'
    || rawStatus === 'opted-out'
    || rawStatus === 'opted_out'
    || rawStatus === 'archived'
  ) {
    return 'unsubscribed';
  }
  const sourceStatus = toNewsletterOperationalStatus(rawStatus);
  if (sourceStatus) return sourceStatus;
  if (contact.status === 'archived') return 'unsubscribed';

  return 'subscribed';
};

export const newsletterStatusFromContact = (contact: Contact): NewsletterSubscriptionStatus => {
  const status = newsletterOperationalStatusFromContact(contact);
  return status === 'unsubscribed' || status === 'bounced' || status === 'complained'
    ? 'unsubscribed'
    : 'subscribed';
};

export const isNewsletterSubscriberSendable = (contact: Contact): boolean => (
  contact.status !== 'archived' && newsletterOperationalStatusFromContact(contact) === 'subscribed'
);

export const isNewsletterContact = (contact: Contact, form?: FormDefinition): boolean => {
  const source = isRecord(contact.sourceValues) ? contact.sourceValues : {};
  return (
    Boolean(form && isNewsletterForm(form))
    || Boolean(contact.newsletterSubscriptionStatus)
    || isRecord(source.newsletter)
    || textValue(source.backyIntent).toLowerCase() === 'newsletter'
    || textValue(source.schemaVersion) === NEWSLETTER_FORM_SCHEMA_VERSION
    || Boolean(readContactSourceValue(contact, 'topics'))
    || Boolean(readContactSourceValue(contact, 'signup_source'))
  );
};

export const buildNewsletterSourceValues = ({
  existingSourceValues,
  status,
  topics,
  source,
  consent,
  consentText,
  requestId,
  now = new Date().toISOString(),
}: NewsletterSourceInput): Record<string, unknown> => {
  const existing = isRecord(existingSourceValues) ? existingSourceValues : {};
  const existingNewsletter = isRecord(existing.newsletter) ? existing.newsletter : {};
  const normalizedTopics = textValue(topics);
  const normalizedSource = textValue(source) || 'newsletter-api';
  const normalizedConsentText = textValue(consentText);
  const subscribedAt = status === 'subscribed'
    ? textValue(existingNewsletter.subscribedAt) || now
    : textValue(existingNewsletter.subscribedAt) || undefined;

  return {
    ...existing,
    backyIntent: 'newsletter',
    schemaVersion: NEWSLETTER_FORM_SCHEMA_VERSION,
    ...(normalizedTopics ? { topics: normalizedTopics } : {}),
    signup_source: normalizedSource,
    ...(consent !== undefined ? { consent } : {}),
    newsletter: {
      ...existingNewsletter,
      schemaVersion: NEWSLETTER_SUBSCRIBE_SCHEMA_VERSION,
      status,
      source: normalizedSource,
      ...(normalizedTopics ? { topics: normalizedTopics } : {}),
      ...(consent !== undefined ? { consent } : {}),
      ...(normalizedConsentText ? { consentText: normalizedConsentText } : {}),
      ...(requestId ? { requestId } : {}),
      ...(subscribedAt ? { subscribedAt } : {}),
      ...(status === 'unsubscribed' ? { unsubscribedAt: now } : {}),
      updatedAt: now,
    },
  };
};

export const buildNewsletterContactFields = ({
  existing,
  status,
  topics,
  source,
  consent,
  consentText,
  now = new Date().toISOString(),
}: Omit<NewsletterSourceInput, 'existingSourceValues' | 'requestId'> & { existing?: Contact | null }): Pick<Contact,
  | 'newsletterSubscriptionStatus'
  | 'newsletterSubscribedAt'
  | 'newsletterUnsubscribedAt'
  | 'newsletterTopics'
  | 'newsletterSource'
  | 'newsletterConsent'
  | 'newsletterConsentText'
> => {
  const normalizedTopics = textValue(topics) || existing?.newsletterTopics || null;
  const normalizedSource = textValue(source) || existing?.newsletterSource || 'newsletter-api';
  const normalizedConsentText = textValue(consentText) || existing?.newsletterConsentText || null;
  const subscribedAt = status === 'subscribed'
    ? existing?.newsletterSubscribedAt || now
    : existing?.newsletterSubscribedAt || null;

  return {
    newsletterSubscriptionStatus: status,
    newsletterSubscribedAt: subscribedAt,
    newsletterUnsubscribedAt: status === 'unsubscribed' ? now : null,
    newsletterTopics: normalizedTopics,
    newsletterSource: normalizedSource,
    newsletterConsent: consent ?? existing?.newsletterConsent ?? null,
    newsletterConsentText: normalizedConsentText,
  };
};

export const buildNewsletterSubscriberPayload = (
  contact: Contact,
  form: FormDefinition,
  options: { includeSourceValues?: boolean } = {},
) => {
  const newsletterStatus = newsletterOperationalStatusFromContact(contact);
  const status = newsletterStatusFromContact(contact);
  const source = isRecord(contact.sourceValues) ? contact.sourceValues : {};
  const newsletter = isRecord(source.newsletter) ? source.newsletter : {};

  return {
    id: contact.id,
    email: contact.email,
    name: contact.name,
    formId: form.id,
    formTitle: form.title || form.name,
    contactStatus: contact.status,
    newsletterStatus,
    subscriptionStatus: status,
    topics: contact.newsletterTopics || readContactSourceValue(contact, 'topics') || textValue(newsletter.topics) || null,
    source: contact.newsletterSource || readContactSourceValue(contact, 'signup_source') || textValue(newsletter.source) || null,
    consent: contact.newsletterConsent ?? booleanValue(source.consent) ?? booleanValue(newsletter.consent) ?? null,
    consentText: contact.newsletterConsentText || textValue(newsletter.consentText) || null,
    sendReady: isNewsletterSubscriberSendable(contact),
    subscribedAt: contact.newsletterSubscribedAt || textValue(newsletter.subscribedAt) || contact.createdAt,
    unsubscribedAt: contact.newsletterUnsubscribedAt || textValue(newsletter.unsubscribedAt) || null,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    ...(options.includeSourceValues ? { sourceValues: contact.sourceValues || {} } : {}),
  };
};

export const buildNewsletterSummary = (contacts: Contact[]) => {
  const subscribed = contacts.filter((contact) => newsletterStatusFromContact(contact) === 'subscribed');
  const unsubscribed = contacts.filter((contact) => newsletterStatusFromContact(contact) === 'unsubscribed');
  const byNewsletterStatus = contacts.reduce<Record<NewsletterOperationalStatus, number>>((summary, contact) => {
    const status = newsletterOperationalStatusFromContact(contact);
    summary[status] += 1;
    return summary;
  }, {
    subscribed: 0,
    unsubscribed: 0,
    pending: 0,
    bounced: 0,
    complained: 0,
  });

  return {
    total: contacts.length,
    subscribed: subscribed.length,
    unsubscribed: unsubscribed.length,
    sendReady: contacts.filter(isNewsletterSubscriberSendable).length,
    held: contacts.filter((contact) => !isNewsletterSubscriberSendable(contact)).length,
    pending: byNewsletterStatus.pending,
    bounced: byNewsletterStatus.bounced,
    complained: byNewsletterStatus.complained,
    byNewsletterStatus,
    activeContacts: contacts.filter((contact) => contact.status !== 'archived').length,
    archivedContacts: contacts.filter((contact) => contact.status === 'archived').length,
  };
};

const formatSourceValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(formatSourceValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
